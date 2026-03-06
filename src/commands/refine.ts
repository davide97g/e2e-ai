import type { Command } from 'commander';
import { join } from 'node:path';
import { readFile, writeFile, fileExists } from '../utils/fs.ts';
import { loadAgent } from '../agents/loadAgent.ts';
import { callLLM } from '../agents/callLLM.ts';
import { resolveCommandContext } from './_shared.ts';
import * as log from '../utils/logger.ts';

export function registerRefine(program: Command) {
  program
    .command('refine [test]')
    .description('Refactor/improve test with AI')
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

      log.info(`Refining test: ${testPath}`);
      const testContent = readFile(testPath);

      // Feature methods and utility patterns come from the two-part prompt system
      // (project context file appended to agent prompt). Pass empty strings as fallback.
      const agent = loadAgent('refactor-agent', ctx.config);
      const response = await callLLM({
        provider: ctx.provider,
        model: ctx.model ?? agent.config.model,
        systemPrompt: agent.systemPrompt,
        userMessage: JSON.stringify({
          testContent,
          featureMethods: '',
          utilityPatterns: '',
        }),
        maxTokens: agent.config.maxTokens,
        temperature: agent.config.temperature,
      });

      let refined = response.content.trim();
      if (refined.startsWith('```')) {
        refined = refined.replace(/^```\w*\n/, '').replace(/\n```$/, '');
      }

      writeFile(testPath, refined);
      log.success(`Test refined in-place: ${testPath}`);
    });
}
