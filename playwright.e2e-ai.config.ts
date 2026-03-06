import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './../../e2e/tests',
  timeout: 120_000,
  retries: 0,
  use: {
    trace: 'on',
    video: 'on',
    screenshot: 'on',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e/traces/results.json' }],
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
