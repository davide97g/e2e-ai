import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal Playwright config for replaying codegen recordings with tracing.
 * Used by scripts/trace/replay-with-trace.mjs.
 *
 * Trace output dir is controlled via TRACE_OUTPUT_DIR env variable.
 * Project root is controlled via E2E_AI_PROJECT_ROOT env variable.
 * Reuses cached auth from .auth/codegen.json when available.
 */
const projectRoot = process.env.E2E_AI_PROJECT_ROOT || resolve(__dirname, '..', '..');
const storageStatePath = resolve(projectRoot, '.auth', 'codegen.json');
const storageState = existsSync(storageStatePath) ? storageStatePath : undefined;

export default defineConfig({
  testDir: projectRoot,
  testMatch: '**/codegen-*.ts',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  outputDir: process.env.TRACE_OUTPUT_DIR || resolve(projectRoot, 'test-results-trace'),
  use: {
    trace: 'on',
    screenshot: 'on',
    actionTimeout: 30_000,
    storageState,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
