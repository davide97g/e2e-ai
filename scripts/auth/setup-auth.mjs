#!/usr/bin/env node
/**
 * TEMPLATE: Authenticate a user and save the storage state for reuse by codegen and trace replay.
 * Uses the Playwright API directly to perform a username/password login flow.
 *
 * This is a reference implementation — adapt the authenticate() function below to match
 * your application's login flow (e.g., different form fields, OAuth redirects, SSO).
 *
 * Usage:
 *   node scripts/auth/setup-auth.mjs                          # single resource (default)
 *   node scripts/auth/setup-auth.mjs --multi                  # multi resource
 *   node scripts/auth/setup-auth.mjs --output .auth/custom.json
 *
 * Credentials come from .env (USERNAME/PASSWORD or MULTI_RESOURCE_USERNAME/PASSWORD).
 * Storage state is saved to .auth/codegen.json by default.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = process.env.E2E_AI_PROJECT_ROOT || resolve(__dirname, '..', '..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const args = process.argv.slice(2);
const isMulti = args.includes('--multi');
const outputIdx = args.indexOf('--output');
const customOutput = outputIdx !== -1 ? args[outputIdx + 1] : null;

const username = isMulti
  ? process.env.MULTI_RESOURCE_USERNAME
  : process.env.SINGLE_RESOURCE_USERNAME;
const password = isMulti
  ? process.env.MULTI_RESOURCE_PASSWORD
  : process.env.SINGLE_RESOURCE_PASSWORD;
const baseUrl = process.env.BASE_URL;

if (!username || !password) {
  const prefix = isMulti ? 'MULTI_RESOURCE' : 'SINGLE_RESOURCE';
  console.error(`Missing ${prefix}_USERNAME or ${prefix}_PASSWORD in .env`);
  process.exit(1);
}
if (!baseUrl) {
  console.error('Missing BASE_URL in .env');
  process.exit(1);
}

const storageStatePath = customOutput
  ? resolve(root, customOutput)
  : resolve(root, '.auth', 'codegen.json');

// Ensure .auth directory exists
const authDir = dirname(storageStatePath);
if (!existsSync(authDir)) {
  mkdirSync(authDir, { recursive: true });
}

/**
 * Authenticate and save storage state.
 * Mirrors the login flow from e2e/config/auth.ts.
 */
async function authenticate() {
  const { chromium } = await import('playwright');

  console.error(`Authenticating as ${username}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(baseUrl);
    await page.waitForEvent('load');

    const usernameInput = page.getByRole('textbox', { name: 'username' });
    await usernameInput.fill(username);
    await usernameInput.press('Enter');

    const passwordInput = page.getByRole('textbox', { name: 'password' });
    await passwordInput.fill(password);
    await passwordInput.press('Enter');

    await page.waitForURL('**/dashboard**', { timeout: 30_000 });

    await context.storageState({ path: storageStatePath });
    console.error(`Storage state saved: ${storageStatePath}`);
  } finally {
    await browser.close();
  }
}

// If the storage state already exists, skip authentication
if (existsSync(storageStatePath)) {
  console.error(`Storage state already exists: ${storageStatePath}`);
  console.error('Reusing cached auth (delete the file to force re-authentication).');
} else {
  await authenticate();
}
