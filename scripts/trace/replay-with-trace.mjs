#!/usr/bin/env node
/**
 * Replay a Playwright codegen recording with tracing enabled.
 * Captures a trace.zip with screenshots, DOM snapshots, and network activity.
 *
 * Usage:
 *   node replay-with-trace.mjs <codegen-file.ts>
 *
 * The trace is saved alongside the codegen file as codegen-<timestamp>-trace.zip.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = process.env.E2E_AI_PROJECT_ROOT || resolve(__dirname, '..', '..');

const codegenFile = process.argv[2];
if (!codegenFile) {
  console.error('Usage: node replay-with-trace.mjs <codegen-file.ts>');
  process.exit(1);
}

const codegenPath = resolve(root, codegenFile);
if (!existsSync(codegenPath)) {
  console.error(`File not found: ${codegenFile}`);
  process.exit(1);
}

const codegenDir = dirname(codegenPath);
const codegenBase = basename(codegenFile, '.ts');
const traceOutputDir = resolve(codegenDir, 'trace-results');
const configPath = resolve(__dirname, 'replay.config.ts');
const traceZipDest = resolve(codegenDir, `${codegenBase}-trace.zip`);

// Ensure auth storage state exists for replay
const storageStatePath = resolve(root, '.auth', 'codegen.json');
if (!existsSync(storageStatePath)) {
  console.error('No cached auth found \u2014 running auth setup...');
  try {
    execSync(`node "${resolve(__dirname, '..', 'auth', 'setup-auth.mjs')}"`, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, E2E_AI_PROJECT_ROOT: root },
    });
  } catch {
    console.error('Auth setup failed \u2014 replay will proceed without cached auth.');
  }
}

console.error(`Replaying with trace: ${codegenFile}`);
console.error(`Trace will be saved to: ${relative(root, traceZipDest)}`);

let replayFailed = false;
try {
  execSync(
    `npx playwright test "${codegenPath}" --config "${configPath}" --project chromium`,
    {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        TRACE_OUTPUT_DIR: traceOutputDir,
      },
    },
  );
} catch {
  replayFailed = true;
  console.error('Replay finished with errors (trace may still be partial).');
}

if (existsSync(traceOutputDir)) {
  const dirs = readdirSync(traceOutputDir, { withFileTypes: true }).filter((d) => d.isDirectory());

  for (const dir of dirs) {
    const traceZip = resolve(traceOutputDir, dir.name, 'trace.zip');
    if (existsSync(traceZip)) {
      renameSync(traceZip, traceZipDest);
      break;
    }
  }

  rmSync(traceOutputDir, { recursive: true, force: true });
}

if (existsSync(traceZipDest)) {
  console.error(`\nTrace saved: ${relative(root, traceZipDest)}`);
  console.error(`Open with:   npx playwright show-trace "${relative(root, traceZipDest)}"`);
  process.exit(replayFailed ? 1 : 0);
} else {
  console.error('\nWarning: No trace file was captured.');
  process.exit(1);
}
