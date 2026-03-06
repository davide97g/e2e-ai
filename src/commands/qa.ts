import type { Command } from 'commander';
import { join } from 'node:path';
import { readFile, writeFile, fileExists, ensureDir } from '../utils/fs.ts';
import { loadAgent } from '../agents/loadAgent.ts';
import { callLLM } from '../agents/callLLM.ts';
import { resolveCommandContext } from './_shared.ts';
import { fetchIssueContext, generateQaExport } from '../integrations/index.ts';
import * as log from '../utils/logger.ts';
import { createSpinner } from '../utils/ui.ts';

export function registerQa(program: Command) {
  program
    .command('qa [test]')
    .description('Generate QA documentation')
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

      const testContent = readFile(testPath);

      // Load optional scenario
      let scenario: any;
      if (ctx.key) {
        const scenarioPath = join(ctx.paths.testsDir, ctx.key, `${ctx.key}.yaml`);
        if (fileExists(scenarioPath)) {
          const yaml = await import('yaml');
          scenario = yaml.parse(readFile(scenarioPath));
        }
      }

      // Load issue context if configured
      let issueContext: any;
      let existingTestCase: any;
      if (ctx.key) {
        issueContext = await fetchIssueContext(ctx.key, ctx.config, ctx.paths);

        // Load existing test case from working dir
        const existingJsonPath = join(ctx.paths.workingDir, ctx.key, `${ctx.key}-zephyr-test-case.json`);
        if (fileExists(existingJsonPath)) {
          existingTestCase = JSON.parse(readFile(existingJsonPath));
        }
      }

      // Call LLM
      const spinner = createSpinner();
      spinner.start('Generating QA documentation...');
      const agent = loadAgent('qa-testcase-agent', ctx.config);
      const response = await callLLM({
        provider: ctx.provider,
        model: ctx.model ?? agent.config.model,
        systemPrompt: agent.systemPrompt,
        userMessage: JSON.stringify({
          testContent,
          scenario,
          existingTestCase,
          key: ctx.key,
          issueContext,
        }),
        maxTokens: agent.config.maxTokens,
        temperature: agent.config.temperature,
      });
      spinner.stop();

      let qaResult: any;
      try {
        let content = response.content.trim();
        if (content.startsWith('```')) {
          content = content.replace(/^```\w*\n/, '').replace(/\n```$/, '');
        }
        qaResult = JSON.parse(content);
      } catch {
        log.error('Failed to parse QA agent response');
        process.exit(1);
      }

      // Use integration dispatcher for output
      await generateQaExport(
        { markdown: qaResult.markdown, testCase: qaResult.testCase ?? qaResult.zephyrTestCase },
        ctx.key ?? 'test',
        ctx.config,
        ctx.paths,
      );

      // Always write markdown as fallback if dispatcher didn't handle it
      if (qaResult.markdown && ctx.config.outputTarget !== 'zephyr') {
        const qaDir = ctx.paths.qaDir;
        const testId = ctx.key ?? 'test';
        const qaMdPath = join(qaDir, `${testId}.md`);
        ensureDir(qaDir);
        writeFile(qaMdPath, qaResult.markdown);
        log.success(`QA document: ${qaMdPath}`);
      }

      log.success('QA documentation generated');
    });
}
