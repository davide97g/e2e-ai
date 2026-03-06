import type { Command } from 'commander';
import { join } from 'node:path';
import { readFile, writeFile, fileExists } from '../utils/fs.ts';
import { loadAgent } from '../agents/loadAgent.ts';
import { callLLM } from '../agents/callLLM.ts';
import { runPlaywrightTest } from './test.ts';
import { resolveCommandContext } from './_shared.ts';
import * as log from '../utils/logger.ts';

const MAX_HEAL_RETRIES = 3;

export function registerHeal(program: Command) {
  program
    .command('heal [test]')
    .description('Self-heal a failing test')
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

      // First, run the test to confirm it fails
      log.info('Running test to confirm failure...');
      let testResult = await runPlaywrightTest(testPath, root);

      if (testResult.passed) {
        log.success('Test is already passing, no healing needed');
        return;
      }

      const agent = loadAgent('self-healing-agent', ctx.config);
      let previousDiagnosis: string | undefined;

      for (let attempt = 1; attempt <= MAX_HEAL_RETRIES; attempt++) {
        log.info(`Healing attempt ${attempt}/${MAX_HEAL_RETRIES}...`);

        const testContent = readFile(testPath);

        const response = await callLLM({
          provider: ctx.provider,
          model: ctx.model ?? agent.config.model,
          systemPrompt: agent.systemPrompt,
          userMessage: JSON.stringify({
            testContent,
            errorOutput: testResult.output,
            traceData: testResult.tracePath ? `Trace available at: ${testResult.tracePath}` : undefined,
            attempt,
            previousDiagnosis,
          }),
          maxTokens: agent.config.maxTokens,
          temperature: agent.config.temperature,
        });

        let healResult: any;
        try {
          let content = response.content.trim();
          if (content.startsWith('```')) {
            content = content.replace(/^```\w*\n/, '').replace(/\n```$/, '');
          }
          healResult = JSON.parse(content);
        } catch {
          log.error('Failed to parse healing response');
          continue;
        }

        const { diagnosis, patchedTest, changes } = healResult;
        previousDiagnosis = `${diagnosis.failureType}: ${diagnosis.rootCause}`;

        log.info(`Diagnosis: ${diagnosis.failureType} - ${diagnosis.rootCause} (${diagnosis.confidence} confidence)`);

        for (const change of changes ?? []) {
          log.verbose(`  Line ${change.line}: ${change.reason}`);
        }

        writeFile(testPath, patchedTest);
        log.info('Patched test written, re-running...');

        testResult = await runPlaywrightTest(testPath, root);

        if (testResult.passed) {
          log.success(`Test healed after ${attempt} attempt(s)!`);
          return;
        }

        log.warn(`Attempt ${attempt} did not fix the test`);
      }

      log.error(`Failed to heal test after ${MAX_HEAL_RETRIES} attempts`);
      process.exit(1);
    });
}
