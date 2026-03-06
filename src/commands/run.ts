import type { Command } from 'commander';
import { join } from 'node:path';
import { fileExists, readFile, writeFile, findFileWithPattern, ensureDir, timestampSuffix } from '../utils/fs.ts';
import { spawnInteractive, waitForProcess } from '../utils/process.ts';
import { loadAgent } from '../agents/loadAgent.ts';
import { callLLM } from '../agents/callLLM.ts';
import { runPlaywrightTest } from './test.ts';
import { runPipeline } from '../pipeline/runPipeline.ts';
import { loadConfig, getPackageRoot } from '../config/loader.ts';
import { resolvePaths } from '../config/paths.ts';
import { fetchIssueContext, generateQaExport } from '../integrations/index.ts';
import type { PipelineContext, PipelineStep } from '../pipeline/types.ts';
import * as log from '../utils/logger.ts';

export function registerRun(program: Command) {
  program
    .command('run [session]')
    .description('Run full pipeline: record -> transcribe -> scenario -> generate -> refine -> test -> heal -> qa')
    .option('--from <step>', 'Start from specific step')
    .option('--skip <steps>', 'Comma-separated steps to skip')
    .action(async (session?: string, cmdOpts?: any) => {
      const opts = program.opts();
      const config = await loadConfig();
      const key = opts.key;
      const paths = resolvePaths(config, key);
      const sessionName = key ?? session ?? `session-${timestampSuffix()}`;

      const ctx: PipelineContext = {
        sessionName,
        key,
        projectRoot: paths.projectRoot,
        appConfig: config,
        paths,
        config: {
          provider: (opts.provider ?? process.env.AI_PROVIDER ?? config.llm.provider) as 'openai' | 'anthropic',
          model: opts.model ?? process.env.AI_MODEL ?? config.llm.model ?? undefined,
          verbose: opts.verbose ?? false,
          noVoice: opts.voice === false || !config.voice.enabled,
          noTrace: opts.trace === false,
          maxHealRetries: 3,
        },
        outputs: {},
        healAttempts: 0,
      };

      const steps = buildSteps();
      const skip = cmdOpts?.skip?.split(',') ?? [];

      const result = await runPipeline(steps, ctx, {
        from: cmdOpts?.from,
        skip,
      });

      if (result.success) {
        log.header('Pipeline Summary');
        log.summary(result.steps);
      } else {
        process.exit(1);
      }
    });
}

function buildSteps(): PipelineStep[] {
  return [
    {
      name: 'record',
      description: 'Launch codegen + audio recording',
      async execute(ctx) {
        const pkgRoot = getPackageRoot();
        const args: string[] = [];
        if (ctx.key) args.push(ctx.key);
        if (ctx.config.noVoice) args.push('--no-voice');
        if (ctx.config.noTrace) args.push('--no-trace');

        const scriptPath = join(pkgRoot, 'scripts', 'codegen-env.mjs');
        const child = spawnInteractive('node', [scriptPath, ...args], {
          cwd: ctx.projectRoot,
          env: {
            ...process.env,
            E2E_AI_PROJECT_ROOT: ctx.projectRoot,
            E2E_AI_WORKING_DIR: ctx.appConfig.paths.workingDir,
            E2E_AI_KEY: ctx.key ?? '',
          },
        });
        const exitCode = await waitForProcess(child);

        if (exitCode !== 0) return { success: false, output: null, error: new Error(`Recording exited with code ${exitCode}`) };

        if (ctx.key) {
          ctx.codegenPath = findFileWithPattern(join(ctx.paths.workingDir, ctx.key), /codegen-.*\.ts$/);
          ctx.audioPath = findFileWithPattern(join(ctx.paths.workingDir, ctx.key, 'recordings'), /\.wav$/);
        }

        return { success: true, output: { codegenPath: ctx.codegenPath, audioPath: ctx.audioPath } };
      },
    },
    {
      name: 'transcribe',
      description: 'Transcribe audio via Whisper',
      canSkip(ctx) {
        return ctx.config.noVoice || !ctx.audioPath;
      },
      async execute(ctx) {
        if (!ctx.audioPath) return { success: true, output: null, nonBlocking: true };

        const pkgRoot = getPackageRoot();
        const transcriber = await import(join(pkgRoot, 'scripts', 'voice', 'transcriber.mjs'));
        const segments = await transcriber.transcribe(ctx.audioPath);

        if (!segments?.length) return { success: true, output: { segments: [] }, nonBlocking: true };

        const outputDir = ctx.key
          ? join(ctx.paths.workingDir, ctx.key)
          : ctx.paths.transcriptsDir;
        const jsonPath = join(outputDir, `${ctx.sessionName}-transcript.json`);
        writeFile(jsonPath, JSON.stringify(segments, null, 2));
        ctx.transcriptPath = jsonPath;

        if (ctx.codegenPath) {
          const merger = await import(join(pkgRoot, 'scripts', 'voice', 'merger.mjs'));
          const content = readFile(ctx.codegenPath);
          const merged = merger.merge(content, segments, segments[segments.length - 1].end);
          writeFile(ctx.codegenPath, merged);
        }

        return { success: true, output: { segments, transcriptPath: ctx.transcriptPath } };
      },
    },
    {
      name: 'scenario',
      description: 'Generate YAML scenario from codegen + transcript',
      async execute(ctx) {
        if (!ctx.codegenPath) return { success: false, output: null, error: new Error('No codegen file') };

        const codegenContent = readFile(ctx.codegenPath);
        let transcriptContent: any;
        if (ctx.transcriptPath && fileExists(ctx.transcriptPath)) {
          transcriptContent = JSON.parse(readFile(ctx.transcriptPath));
        }

        let narrative: any;
        if (transcriptContent) {
          const agent = loadAgent('transcript-agent', ctx.appConfig);
          const resp = await callLLM({
            provider: ctx.config.provider,
            model: ctx.config.model ?? agent.config.model,
            systemPrompt: agent.systemPrompt,
            userMessage: JSON.stringify({ codegen: codegenContent, transcript: transcriptContent }),
            maxTokens: agent.config.maxTokens,
            temperature: agent.config.temperature,
          });
          narrative = JSON.parse(resp.content);
        } else {
          narrative = {
            sessionSummary: 'Recording session (no voice)',
            actionIntents: codegenContent.split('\n')
              .filter((l: string) => l.trim().startsWith('await '))
              .map((l: string, i: number) => ({ codegenLine: l.trim(), lineNumber: i + 1, intent: 'Recorded action', voiceContext: null })),
          };
        }

        // Load issue context if configured
        let issueContext: any;
        if (ctx.key) {
          issueContext = await fetchIssueContext(ctx.key, ctx.appConfig, ctx.paths);
        }

        const agent = loadAgent('scenario-agent', ctx.appConfig);
        const resp = await callLLM({
          provider: ctx.config.provider,
          model: ctx.config.model ?? agent.config.model,
          systemPrompt: agent.systemPrompt,
          userMessage: JSON.stringify({ narrative, key: ctx.key, issueContext }),
          maxTokens: agent.config.maxTokens,
          temperature: agent.config.temperature,
        });

        const scenarioDir = join(ctx.paths.testsDir, ctx.sessionName);
        ensureDir(scenarioDir);
        const scenarioPath = join(scenarioDir, `${ctx.sessionName}.yaml`);
        writeFile(scenarioPath, resp.content.trim());
        ctx.scenarioPath = scenarioPath;

        return { success: true, output: { scenarioPath } };
      },
    },
    {
      name: 'generate',
      description: 'Generate Playwright test from scenario',
      async execute(ctx) {
        if (!ctx.scenarioPath) return { success: false, output: null, error: new Error('No scenario file') };

        const yaml = await import('yaml');
        const scenario = yaml.parse(readFile(ctx.scenarioPath));

        const agent = loadAgent('playwright-generator-agent', ctx.appConfig);
        const resp = await callLLM({
          provider: ctx.config.provider,
          model: ctx.config.model ?? agent.config.model,
          systemPrompt: agent.systemPrompt,
          userMessage: JSON.stringify({ scenario }),
          maxTokens: agent.config.maxTokens,
          temperature: agent.config.temperature,
        });

        let testContent = resp.content.trim();
        if (testContent.startsWith('```')) testContent = testContent.replace(/^```\w*\n/, '').replace(/\n```$/, '');

        const testName = ctx.key ?? ctx.sessionName;
        const testDir = join(ctx.paths.testsDir, testName);
        ctx.testPath = join(testDir, `${testName}.test.ts`);
        ensureDir(testDir);
        writeFile(ctx.testPath, testContent);

        return { success: true, output: { testPath: ctx.testPath } };
      },
    },
    {
      name: 'refine',
      description: 'Refactor test with AI',
      async execute(ctx) {
        if (!ctx.testPath) return { success: false, output: null, error: new Error('No test file') };

        const testContent = readFile(ctx.testPath);
        const agent = loadAgent('refactor-agent', ctx.appConfig);
        const resp = await callLLM({
          provider: ctx.config.provider,
          model: ctx.config.model ?? agent.config.model,
          systemPrompt: agent.systemPrompt,
          userMessage: JSON.stringify({
            testContent,
            featureMethods: '',
            utilityPatterns: '',
          }),
          maxTokens: agent.config.maxTokens,
          temperature: agent.config.temperature,
        });

        let refined = resp.content.trim();
        if (refined.startsWith('```')) refined = refined.replace(/^```\w*\n/, '').replace(/\n```$/, '');

        writeFile(ctx.testPath, refined);
        return { success: true, output: { testPath: ctx.testPath } };
      },
    },
    {
      name: 'test',
      description: 'Run Playwright test',
      async execute(ctx) {
        if (!ctx.testPath) return { success: false, output: null, error: new Error('No test file') };

        const result = await runPlaywrightTest(ctx.testPath, ctx.projectRoot);
        ctx.testResult = result;
        ctx.tracePath = result.tracePath;

        return { success: true, output: result };
      },
    },
    {
      name: 'heal',
      description: 'Self-heal failing test',
      canSkip(ctx) {
        return ctx.testResult?.passed === true;
      },
      async execute(ctx) {
        if (!ctx.testPath || !ctx.testResult) return { success: true, output: null };

        const agent = loadAgent('self-healing-agent', ctx.appConfig);
        let previousDiagnosis: string | undefined;

        for (let attempt = 1; attempt <= ctx.config.maxHealRetries; attempt++) {
          ctx.healAttempts = attempt;
          log.info(`  Heal attempt ${attempt}/${ctx.config.maxHealRetries}`);

          const testContent = readFile(ctx.testPath);
          const resp = await callLLM({
            provider: ctx.config.provider,
            model: ctx.config.model ?? agent.config.model,
            systemPrompt: agent.systemPrompt,
            userMessage: JSON.stringify({
              testContent,
              errorOutput: ctx.testResult.output,
              attempt,
              previousDiagnosis,
            }),
            maxTokens: agent.config.maxTokens,
            temperature: agent.config.temperature,
          });

          let content = resp.content.trim();
          if (content.startsWith('```')) content = content.replace(/^```\w*\n/, '').replace(/\n```$/, '');
          const healResult = JSON.parse(content);
          previousDiagnosis = `${healResult.diagnosis.failureType}: ${healResult.diagnosis.rootCause}`;

          writeFile(ctx.testPath, healResult.patchedTest);
          const testResult = await runPlaywrightTest(ctx.testPath, ctx.projectRoot);
          ctx.testResult = testResult;

          if (testResult.passed) {
            return { success: true, output: { healed: true, attempts: attempt } };
          }
        }

        return { success: false, output: null, error: new Error(`Failed to heal after ${ctx.config.maxHealRetries} attempts`) };
      },
    },
    {
      name: 'qa',
      description: 'Generate QA documentation',
      async execute(ctx) {
        if (!ctx.testPath) return { success: false, output: null, error: new Error('No test file') };

        const testContent = readFile(ctx.testPath);
        let scenario: any;
        if (ctx.scenarioPath && fileExists(ctx.scenarioPath)) {
          const yaml = await import('yaml');
          scenario = yaml.parse(readFile(ctx.scenarioPath));
        }

        let issueContext: any;
        if (ctx.key) {
          issueContext = await fetchIssueContext(ctx.key, ctx.appConfig, ctx.paths);
        }

        const agent = loadAgent('qa-testcase-agent', ctx.appConfig);
        const resp = await callLLM({
          provider: ctx.config.provider,
          model: ctx.config.model ?? agent.config.model,
          systemPrompt: agent.systemPrompt,
          userMessage: JSON.stringify({
            testContent,
            scenario,
            key: ctx.key,
            issueContext,
          }),
          maxTokens: agent.config.maxTokens,
          temperature: agent.config.temperature,
        });

        let content = resp.content.trim();
        if (content.startsWith('```')) content = content.replace(/^```\w*\n/, '').replace(/\n```$/, '');
        const qaResult = JSON.parse(content);

        await generateQaExport(
          { markdown: qaResult.markdown, testCase: qaResult.testCase ?? qaResult.zephyrTestCase },
          ctx.key ?? ctx.sessionName,
          ctx.appConfig,
          ctx.paths,
        );

        return { success: true, output: qaResult, nonBlocking: true };
      },
    },
  ];
}
