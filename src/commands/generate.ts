import type { Command } from 'commander';
import { join, basename } from 'node:path';
import { readFile, writeFile, fileExists, ensureDir } from '../utils/fs.ts';
import { loadAgent } from '../agents/loadAgent.ts';
import { callLLM } from '../agents/callLLM.ts';
import { resolveCommandContext } from './_shared.ts';
import { generateQaExport } from '../integrations/index.ts';
import * as log from '../utils/logger.ts';

export function registerGenerate(program: Command) {
  program
    .command('generate [scenario]')
    .description('Generate Playwright test from YAML scenario')
    .action(async (scenarioArg?: string) => {
      const ctx = await resolveCommandContext(program);
      const root = ctx.paths.projectRoot;

      // Resolve scenario file
      let scenarioPath: string;
      if (scenarioArg && fileExists(join(root, scenarioArg))) {
        scenarioPath = join(root, scenarioArg);
      } else if (ctx.key) {
        scenarioPath = join(ctx.paths.testsDir, ctx.key, `${ctx.key}.yaml`);
      } else if (scenarioArg) {
        scenarioPath = join(ctx.paths.testsDir, scenarioArg, `${scenarioArg}.yaml`);
      } else {
        log.error('Provide a scenario file path or --key');
        process.exit(1);
      }

      if (!fileExists(scenarioPath)) {
        log.error(`Scenario not found: ${scenarioPath}`);
        process.exit(1);
      }

      log.info(`Reading scenario: ${scenarioPath}`);
      const yaml = await import('yaml');
      const scenario = yaml.parse(readFile(scenarioPath));

      // Call LLM — project context comes from the two-part prompt system (context file)
      log.info('Generating test with playwright-generator-agent...');
      const agent = loadAgent('playwright-generator-agent', ctx.config);
      const response = await callLLM({
        provider: ctx.provider,
        model: ctx.model ?? agent.config.model,
        systemPrompt: agent.systemPrompt,
        userMessage: JSON.stringify({
          scenario,
          projectContext: scenario.projectContext ?? undefined,
        }),
        maxTokens: agent.config.maxTokens,
        temperature: agent.config.temperature,
      });

      let testContent = response.content.trim();
      if (testContent.startsWith('```')) {
        testContent = testContent.replace(/^```\w*\n/, '').replace(/\n```$/, '');
      }

      // Determine output path
      const testName = scenario.issueKey ?? ctx.key ?? basename(scenarioPath, '.yaml');
      const testDir = join(ctx.paths.testsDir, testName);
      const testPath = join(testDir, `${testName}.test.ts`);
      ensureDir(testDir);
      writeFile(testPath, testContent);
      log.success(`Test generated: ${testPath}`);

      // Generate Zephyr export if configured
      const needsZephyr = ctx.config.outputTarget === 'zephyr' || ctx.config.outputTarget === 'both';
      if (needsZephyr && (scenario.issueKey || ctx.key)) {
        const issueKey = scenario.issueKey ?? ctx.key;
        const testCase = {
          issueKey,
          issueContext: scenario.issueContext ?? {},
          title: scenario.name,
          precondition: scenario.precondition,
          steps: (scenario.steps ?? []).map((s: any) => ({
            stepNumber: s.number,
            description: s.action,
            expectedResult: s.expectedResult,
          })),
        };

        await generateQaExport({ testCase }, issueKey, ctx.config, ctx.paths);
        log.success(`Zephyr export generated`);
      }
    });
}
