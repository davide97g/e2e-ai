import { join } from 'node:path';
import type { ResolvedConfig } from './schema.ts';
import { getProjectRoot } from './loader.ts';

/**
 * Build a Playwright config object at runtime by merging package defaults
 * with user overrides from `e2e-ai.config.ts`.
 *
 * Used by the `test` command instead of a hardcoded config file.
 */
export function buildPlaywrightConfig(config: ResolvedConfig) {
  const projectRoot = getProjectRoot();

  return {
    testDir: join(projectRoot, config.paths.tests),
    timeout: config.playwright.timeout,
    retries: config.playwright.retries,
    use: {
      trace: config.playwright.traceMode as 'on' | 'off' | 'retain-on-failure',
      video: 'on' as const,
      screenshot: 'on' as const,
    },
    reporter: [
      ['list'] as ['list'],
      ['json', { outputFile: join(projectRoot, config.paths.traces, 'results.json') }] as ['json', { outputFile: string }],
    ],
    projects: [
      {
        name: config.playwright.browser,
        use: {},
      },
    ],
  };
}
