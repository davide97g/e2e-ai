import type { Command } from 'commander';
import { join } from 'node:path';
import { resolveCommandContext } from './_shared.ts';
import { loadAgent } from '../agents/loadAgent.ts';
import { callLLM } from '../agents/callLLM.ts';
import { extractJSON } from '../agents/parseResponse.ts';
import { readFile, writeFile, fileExists } from '../utils/fs.ts';
import * as log from '../utils/logger.ts';
import { createSpinner } from '../utils/ui.ts';

export function registerAnalyze(program: Command) {
  program
    .command('analyze [input]')
    .description('Analyze AST scan with AI to generate QA map (features, workflows, scenarios)')
    .option('--output <file>', 'Write QA map to specific file')
    .option('--skip-scenarios', 'Only run feature analysis (skip scenario generation)')
    .action(async (inputArg?: string, opts?: any) => {
      const ctx = await resolveCommandContext(program);
      const root = ctx.paths.projectRoot;

      // Resolve input AST file
      let inputPath: string;
      if (inputArg) {
        inputPath = join(root, inputArg);
      } else if (ctx.key) {
        inputPath = join(ctx.paths.workingDir, ctx.key, 'ast-scan.json');
      } else {
        inputPath = join(root, '.e2e-ai', 'ast-scan.json');
      }

      if (!fileExists(inputPath)) {
        log.error(`AST scan not found: ${inputPath}. Run "e2e-ai scan" first.`);
        process.exit(1);
      }

      const ast = JSON.parse(readFile(inputPath));

      // Stage 2: Feature analysis
      const spinner = createSpinner();
      spinner.start('Analyzing features and workflows...');
      const featureAgent = loadAgent('feature-analyzer-agent', ctx.config);
      const featureResponse = await callLLM({
        provider: ctx.provider,
        model: ctx.model ?? featureAgent.config.model,
        systemPrompt: featureAgent.systemPrompt,
        userMessage: JSON.stringify({ ast }),
        maxTokens: featureAgent.config.maxTokens,
        temperature: featureAgent.config.temperature,
        jsonMode: true,
      });
      spinner.stop();

      const qaMap = JSON.parse(extractJSON(featureResponse.content));
      if (!qaMap?.features) {
        log.error('Feature analysis failed: invalid response');
        process.exit(1);
      }

      log.success(`Identified ${qaMap.features.length} features, ${qaMap.workflows.length} workflows, ${qaMap.components.length} components`);

      // Stage 3: Scenario generation (unless skipped)
      let finalPayload = qaMap;
      if (!opts?.skipScenarios) {
        spinner.start('Generating test scenarios...');
        const scenarioAgent = loadAgent('scenario-planner-agent', ctx.config);
        const scenarioResponse = await callLLM({
          provider: ctx.provider,
          model: ctx.model ?? scenarioAgent.config.model,
          systemPrompt: scenarioAgent.systemPrompt,
          userMessage: JSON.stringify(qaMap),
          maxTokens: scenarioAgent.config.maxTokens,
          temperature: scenarioAgent.config.temperature,
          jsonMode: true,
        });
        spinner.stop();

        try {
          finalPayload = JSON.parse(extractJSON(scenarioResponse.content));
        } catch {
          log.warn('Scenario generation returned invalid JSON, using feature map only');
          finalPayload = { ...qaMap, scenarios: [] };
        }

        if (!finalPayload?.scenarios) {
          log.warn('Scenario generation returned no scenarios, using feature map only');
          finalPayload = { ...qaMap, scenarios: [] };
        } else {
          log.success(`Generated ${finalPayload.scenarios.length} scenarios`);
        }
      } else {
        finalPayload = { ...qaMap, scenarios: [] };
      }

      // Write output
      const outputPath = opts?.output
        ?? (ctx.key
          ? join(ctx.paths.workingDir, ctx.key, 'qa-map.json')
          : join(root, '.e2e-ai', 'qa-map.json'));

      writeFile(outputPath, JSON.stringify(finalPayload, null, 2));
      log.success(`QA map written to ${outputPath}`);
    });
}
