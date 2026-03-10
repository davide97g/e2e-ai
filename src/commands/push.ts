import type { Command } from 'commander';
import { join } from 'node:path';
import { resolveCommandContext } from './_shared.ts';
import { pushToApi } from '../scanner/push.ts';
import { readFile, fileExists } from '../utils/fs.ts';
import * as log from '../utils/logger.ts';
import { createSpinner } from '../utils/ui.ts';
import type { QAMapV2Payload } from '../scanner/types.ts';

export function registerPush(program: Command) {
  program
    .command('push [input]')
    .description('Push QA map to remote API')
    .option('--commit-sha <sha>', 'Git commit SHA to associate')
    .action(async (inputArg?: string, opts?: any) => {
      const ctx = await resolveCommandContext(program);

      const apiUrl = ctx.config.push?.apiUrl ?? process.env.E2E_AI_API_URL;
      const apiKey = ctx.config.push?.apiKey ?? process.env.E2E_AI_API_KEY;

      if (!apiUrl) {
        log.error('No push.apiUrl configured. Set it in e2e-ai.config.ts or E2E_AI_API_URL env var.');
        process.exit(1);
      }
      if (!apiKey) {
        log.error('No push.apiKey configured. Set it in e2e-ai.config.ts or E2E_AI_API_KEY env var.');
        process.exit(1);
      }

      // Resolve input file
      const root = ctx.paths.projectRoot;
      let inputPath: string;
      if (inputArg) {
        inputPath = join(root, inputArg);
      } else if (ctx.key) {
        inputPath = join(ctx.paths.workingDir, ctx.key, 'qa-map.json');
      } else {
        inputPath = join(root, '.e2e-ai', 'qa-map.json');
      }

      if (!fileExists(inputPath)) {
        log.error(`QA map not found: ${inputPath}`);
        process.exit(1);
      }

      const payload: QAMapV2Payload = JSON.parse(readFile(inputPath));
      if (opts?.commitSha) {
        payload.commitSha = opts.commitSha;
      }

      log.info(`Pushing: ${payload.features.length} features, ${payload.workflows.length} workflows, ${payload.scenarios.length} scenarios`);

      const spinner = createSpinner();
      spinner.start('Pushing to API...');
      const result = await pushToApi(payload, apiUrl, apiKey);
      spinner.stop();

      log.success('Push successful!');
      log.info(`  Version: ${result.version} (schema v${result.schemaVersion})`);
      log.info(`  Auto-linked scenarios: ${result.stats.autoLinkedScenarios}`);
    });
}
