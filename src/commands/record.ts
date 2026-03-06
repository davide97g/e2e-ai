import type { Command } from 'commander';
import { join } from 'node:path';
import { spawnInteractive, waitForProcess } from '../utils/process.ts';
import { getPackageRoot } from '../config/loader.ts';
import { resolveCommandContext } from './_shared.ts';
import * as log from '../utils/logger.ts';

export function registerRecord(program: Command) {
  program
    .command('record [session]')
    .description('Launch Playwright codegen with audio recording')
    .action(async (session?: string) => {
      const ctx = await resolveCommandContext(program);
      const scriptPath = join(getPackageRoot(), 'scripts', 'codegen-env.mjs');

      const args: string[] = [];
      if (ctx.key) {
        args.push(ctx.key);
      } else if (session) {
        args.push(session);
      }

      if (!ctx.voice) args.push('--no-voice');
      if (!ctx.trace) args.push('--no-trace');

      log.info(`Launching codegen recording...`);
      if (ctx.key) log.info(`Issue key: ${ctx.key}`);
      log.verbose(`Script: ${scriptPath}`);
      log.verbose(`Args: ${args.join(' ')}`);

      const child = spawnInteractive('node', [scriptPath, ...args], {
        cwd: ctx.paths.projectRoot,
        env: {
          ...process.env,
          E2E_AI_PROJECT_ROOT: ctx.paths.projectRoot,
          E2E_AI_WORKING_DIR: ctx.config.paths.workingDir,
          E2E_AI_KEY: ctx.key ?? '',
        },
      });

      const exitCode = await waitForProcess(child);

      if (exitCode === 0) {
        log.success('Recording session completed');
      } else {
        log.error(`Recording exited with code ${exitCode}`);
        process.exit(exitCode);
      }
    });
}
