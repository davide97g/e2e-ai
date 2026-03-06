import type { Command } from 'commander';
import { join } from 'node:path';
import { fileExists, ensureDir } from '../utils/fs.ts';
import { spawnAndCapture } from '../utils/process.ts';
import { resolveCommandContext } from './_shared.ts';
import { loadConfig, getProjectRoot } from '../config/loader.ts';
import { resolvePaths } from '../config/paths.ts';
import * as log from '../utils/logger.ts';
import { createSpinner } from '../utils/ui.ts';
import type { TestResult } from '../types/index.ts';

export function registerTest(program: Command) {
  program
    .command('test [test]')
    .description('Run Playwright test with traces')
    .action(async (testArg?: string) => {
      const ctx = await resolveCommandContext(program);
      const root = ctx.paths.projectRoot;

      // Resolve test file
      let testPath: string;
      if (testArg && fileExists(join(root, testArg))) {
        testPath = join(root, testArg);
      } else if (ctx.key) {
        testPath = join(ctx.paths.testsDir, ctx.key, `${ctx.key}.test.ts`);
      } else {
        log.error('Provide a test file path or --key');
        process.exit(1);
      }

      if (!fileExists(testPath)) {
        log.error(`Test file not found: ${testPath}`);
        process.exit(1);
      }

      const spinner = createSpinner();
      spinner.start('Running Playwright test...');
      const result = await runPlaywrightTest(testPath, root);
      spinner.stop();

      if (result.passed) {
        log.success(`Test PASSED (exit code ${result.exitCode})`);
      } else {
        log.error(`Test FAILED (exit code ${result.exitCode})`);
        if (result.errorMessage) {
          log.error(result.errorMessage);
        }
      }
    });
}

export async function runPlaywrightTest(testPath: string, root?: string): Promise<TestResult> {
  const projectRoot = root ?? getProjectRoot();
  const config = await loadConfig();
  const paths = resolvePaths(config);

  ensureDir(paths.tracesDir);

  const args = [
    'playwright', 'test',
    testPath,
    '--project', config.playwright.browser,
  ];

  // Use the package's PW config if it exists, otherwise let Playwright find its own
  const pkgConfigPath = join(projectRoot, 'packages', 'e2e-ai', 'playwright.e2e-ai.config.ts');
  if (fileExists(pkgConfigPath)) {
    args.push('--config', pkgConfigPath);
  }

  log.info(`Running: npx ${args.join(' ')}`);

  const result = await spawnAndCapture('npx', args, {
    cwd: projectRoot,
    env: { ...process.env },
  });

  let errorMessage: string | undefined;
  const combined = result.stdout + result.stderr;
  const errorMatch = combined.match(/Error:.*$/m);
  if (errorMatch) {
    errorMessage = errorMatch[0];
  }

  const traceMatch = combined.match(/trace:\s*(.*\.zip)/);
  const tracePath = traceMatch?.[1];

  return {
    passed: result.exitCode === 0,
    exitCode: result.exitCode,
    output: combined,
    errorMessage,
    tracePath,
  };
}
