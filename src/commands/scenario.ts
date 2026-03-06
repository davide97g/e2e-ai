import type { Command } from 'commander';
import { join } from 'node:path';
import { readFile, writeFile, fileExists, findFileWithPattern, ensureDir } from '../utils/fs.ts';
import { loadAgent } from '../agents/loadAgent.ts';
import { callLLM } from '../agents/callLLM.ts';
import { extractJSON, extractYAML } from '../agents/parseResponse.ts';
import { resolveCommandContext } from './_shared.ts';
import { fetchIssueContext } from '../integrations/index.ts';
import * as log from '../utils/logger.ts';

export function registerScenario(program: Command) {
  program
    .command('scenario [session]')
    .description('Generate YAML scenario from codegen + transcript')
    .action(async (session?: string) => {
      const ctx = await resolveCommandContext(program);
      const root = ctx.paths.projectRoot;

      // Resolve input files
      let codegenContent: string | undefined;
      let transcriptContent: string | undefined;

      if (ctx.key) {
        const keyDir = join(ctx.paths.workingDir, ctx.key);
        const recordingsDir = join(keyDir, 'recordings');

        const codegenFile = findFileWithPattern(keyDir, /codegen-.*\.ts$/);
        const transcriptFile =
          findFileWithPattern(keyDir, /transcript\.json$/) ??
          findFileWithPattern(recordingsDir, /voice-.*\.json$/) ??
          findFileWithPattern(keyDir, /voice-.*\.json$/);

        if (codegenFile) codegenContent = readFile(codegenFile);
        if (transcriptFile) transcriptContent = readFile(transcriptFile);
      } else if (session) {
        const codegenPath = join(ctx.paths.recordingsDir, `${session}.ts`);
        const transcriptPath = join(ctx.paths.transcriptsDir, `${session}-transcript.json`);
        if (fileExists(codegenPath)) codegenContent = readFile(codegenPath);
        if (fileExists(transcriptPath)) transcriptContent = readFile(transcriptPath);
      }

      if (!codegenContent) {
        log.error('No codegen file found. Run `e2e-ai record` first.');
        process.exit(1);
      }

      // Load issue context if configured
      let issueContext: any;
      if (ctx.key) {
        issueContext = await fetchIssueContext(ctx.key, ctx.config, ctx.paths);
      }

      // Step 1: Transcript analysis (if transcript available)
      let narrative: any;
      if (transcriptContent) {
        log.info('Analyzing transcript with transcript-agent...');
        const transcriptAgent = loadAgent('transcript-agent', ctx.config);
        const transcriptResponse = await callLLM({
          provider: ctx.provider,
          model: ctx.model ?? transcriptAgent.config.model,
          systemPrompt: transcriptAgent.systemPrompt,
          userMessage: JSON.stringify({
            codegen: codegenContent,
            transcript: JSON.parse(transcriptContent),
          }),
          maxTokens: transcriptAgent.config.maxTokens,
          temperature: transcriptAgent.config.temperature,
          jsonMode: true,
        });
        narrative = JSON.parse(extractJSON(transcriptResponse.content));
        log.success(`Narrative generated: ${narrative.sessionSummary}`);
      } else {
        log.warn('No transcript found, generating scenario from codegen only');
        narrative = {
          sessionSummary: 'Recording session (no voice)',
          actionIntents: codegenContent
            .split('\n')
            .filter((l: string) => l.trim().startsWith('await '))
            .map((l: string, i: number) => ({
              codegenLine: l.trim(),
              lineNumber: i + 1,
              intent: 'Recorded action',
              voiceContext: null,
            })),
        };
      }

      // Step 2: Scenario generation
      log.info('Generating scenario with scenario-agent...');
      const scenarioAgent = loadAgent('scenario-agent', ctx.config);
      const scenarioResponse = await callLLM({
        provider: ctx.provider,
        model: ctx.model ?? scenarioAgent.config.model,
        systemPrompt: scenarioAgent.systemPrompt,
        userMessage: JSON.stringify({
          narrative,
          key: ctx.key,
          issueContext,
        }),
        maxTokens: scenarioAgent.config.maxTokens,
        temperature: scenarioAgent.config.temperature,
      });

      const scenarioYaml = extractYAML(scenarioResponse.content);

      // Save scenario
      const scenarioName = ctx.key ?? session ?? 'scenario';
      const scenarioDir = join(ctx.paths.testsDir, scenarioName);
      const scenarioPath = join(scenarioDir, `${scenarioName}.yaml`);
      ensureDir(scenarioDir);
      writeFile(scenarioPath, scenarioYaml);
      log.success(`Scenario saved: ${scenarioPath}`);
    });
}
