import type { Command } from 'commander';
import { join } from 'node:path';
import { select, confirm, input } from '@inquirer/prompts';
import pc from 'picocolors';
import { writeFile, fileExists, ensureDir } from '../utils/fs.ts';
import { loadAgent } from '../agents/loadAgent.ts';
import { callLLM } from '../agents/callLLM.ts';
import { getProjectRoot, getPackageRoot } from '../config/loader.ts';
import { DEFAULT_CONFIG } from '../config/defaults.ts';
import { createSpinner } from '../utils/ui.ts';
import * as log from '../utils/logger.ts';

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Initialize e2e-ai configuration for your project')
    .option('--non-interactive', 'Skip interactive prompts, use defaults')
    .action(async (cmdOpts?: any) => {
      const projectRoot = getProjectRoot();
      log.header('e2e-ai init');

      // Part A: CLI config prompts (deterministic)
      const answers = cmdOpts?.nonInteractive
        ? getDefaultAnswers()
        : await askConfigQuestions();

      // Build config
      const config = buildConfigFromAnswers(answers);
      const configPath = join(projectRoot, 'e2e-ai.config.ts');

      if (fileExists(configPath)) {
        log.warn(`Config already exists: ${configPath}`);
        const overwrite = cmdOpts?.nonInteractive
          ? false
          : await confirm({ message: 'Overwrite existing config?', default: false });
        if (!overwrite) {
          log.info('Skipping config generation');
        } else {
          writeFile(configPath, generateConfigFile(config));
          log.success(`Config written: ${configPath}`);
        }
      } else {
        writeFile(configPath, generateConfigFile(config));
        log.success(`Config written: ${configPath}`);
      }

      // Part B: Conversational LLM agent for context generation
      if (!cmdOpts?.nonInteractive) {
        const opts = program.opts();
        const provider = (opts.provider ?? process.env.AI_PROVIDER ?? answers.provider ?? 'openai') as 'openai' | 'anthropic';
        const model = opts.model ?? process.env.AI_MODEL;

        const spinner = createSpinner();
        spinner.start('Scanning codebase for test patterns...');
        const scan = await scanCodebase(projectRoot);
        spinner.stop();

        if (scan.testFiles.length === 0 && scan.configFiles.length === 0) {
          log.warn('No test files found. Skipping context generation.');
          log.info('You can create e2e-ai.context.md manually later.');
        } else {
          log.info(`Found ${scan.testFiles.length} test files, ${scan.configFiles.length} config files`);
          const contextContent = await runInitConversation(scan, provider, model);

          if (contextContent) {
            const contextPath = join(projectRoot, config.contextFile ?? 'e2e-ai.context.md');
            writeFile(contextPath, contextContent);
            log.success(`Context file written: ${contextPath}`);
          }
        }
      }

      log.success('\nInitialization complete!');
    });
}

interface ConfigAnswers {
  inputSource: string;
  outputTarget: string;
  voiceEnabled: boolean;
  provider: string;
  baseUrl: string;
}

function getDefaultAnswers(): ConfigAnswers {
  return {
    inputSource: 'none',
    outputTarget: 'markdown',
    voiceEnabled: true,
    provider: 'openai',
    baseUrl: process.env.BASE_URL ?? '',
  };
}

async function askConfigQuestions(): Promise<ConfigAnswers> {
  log.info('Configure your e2e-ai setup:\n');

  const inputSource = await select({
    message: 'Issue tracker',
    choices: [
      { name: 'None', value: 'none' },
      { name: 'Jira', value: 'jira' },
      { name: 'Linear', value: 'linear' },
    ],
    default: 'none',
  });

  const outputTarget = await select({
    message: 'QA documentation format',
    choices: [
      { name: 'Markdown', value: 'markdown' },
      { name: 'Zephyr', value: 'zephyr' },
      { name: 'Both', value: 'both' },
    ],
    default: 'markdown',
  });

  const voiceEnabled = await confirm({
    message: 'Enable voice recording?',
    default: true,
  });

  const provider = await select({
    message: 'LLM provider',
    choices: [
      { name: 'OpenAI', value: 'openai' },
      { name: 'Anthropic', value: 'anthropic' },
    ],
    default: 'openai',
  });

  const baseUrl = await input({
    message: 'Base URL',
    default: process.env.BASE_URL ?? '',
  });

  return {
    inputSource,
    outputTarget,
    voiceEnabled,
    provider,
    baseUrl,
  };
}

function buildConfigFromAnswers(answers: ConfigAnswers): Record<string, any> {
  const config: Record<string, any> = {
    inputSource: answers.inputSource,
    outputTarget: answers.outputTarget,
    voice: { enabled: answers.voiceEnabled },
    llm: { provider: answers.provider },
    contextFile: 'e2e-ai.context.md',
  };

  if (answers.baseUrl) {
    config.baseUrl = answers.baseUrl;
  }

  if (answers.outputTarget === 'zephyr' || answers.outputTarget === 'both') {
    config.integrations = {
      zephyr: { titlePrefix: 'UI Automation' },
    };
  }

  return config;
}

function generateConfigFile(config: Record<string, any>): string {
  const lines: string[] = [
    `import { defineConfig } from 'e2e-ai/config';`,
    '',
    'export default defineConfig({',
  ];

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'object' && value !== null) {
      lines.push(`  ${key}: ${JSON.stringify(value)},`);
    } else if (typeof value === 'string') {
      lines.push(`  ${key}: '${value}',`);
    } else {
      lines.push(`  ${key}: ${value},`);
    }
  }

  lines.push('});');
  lines.push('');

  return lines.join('\n');
}

interface CodebaseScan {
  testFiles: string[];
  configFiles: string[];
  fixtureFiles: string[];
  featureFiles: string[];
  tsconfigPaths: Record<string, string[]>;
  playwrightConfig: string | null;
  sampleTestContent: string | null;
}

async function scanCodebase(root: string): Promise<CodebaseScan> {
  const { readdirSync, existsSync, readFileSync, statSync } = await import('node:fs');
  const { join, relative } = await import('node:path');

  const scan: CodebaseScan = {
    testFiles: [],
    configFiles: [],
    fixtureFiles: [],
    featureFiles: [],
    tsconfigPaths: {},
    playwrightConfig: null,
    sampleTestContent: null,
  };

  // Recursive file finder
  function walk(dir: string, depth = 0): string[] {
    if (depth > 5) return [];
    const files: string[] = [];
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...walk(full, depth + 1));
        } else {
          files.push(full);
        }
      }
    } catch {}
    return files;
  }

  const allFiles = walk(root);

  for (const file of allFiles) {
    const rel = relative(root, file);
    if (rel.endsWith('.test.ts') || rel.endsWith('.spec.ts')) {
      scan.testFiles.push(rel);
      if (!scan.sampleTestContent && scan.testFiles.length <= 3) {
        try { scan.sampleTestContent = readFileSync(file, 'utf-8').slice(0, 3000); } catch {}
      }
    }
    if (rel.endsWith('.feature.ts')) scan.featureFiles.push(rel);
    if (rel.includes('fixture') && rel.endsWith('.ts')) scan.fixtureFiles.push(rel);
    if (rel === 'playwright.config.ts' || rel === 'playwright.config.js') scan.playwrightConfig = rel;
    if (rel === 'tsconfig.json' || rel.endsWith('/tsconfig.json')) {
      try {
        const tsconfig = JSON.parse(readFileSync(file, 'utf-8'));
        if (tsconfig.compilerOptions?.paths) {
          scan.tsconfigPaths = { ...scan.tsconfigPaths, ...tsconfig.compilerOptions.paths };
        }
      } catch {}
    }
  }

  // Look for config files
  for (const name of ['playwright.config.ts', 'vitest.config.ts', 'jest.config.ts', 'tsconfig.json', 'package.json']) {
    if (existsSync(join(root, name))) scan.configFiles.push(name);
  }

  return scan;
}

async function runInitConversation(
  scan: CodebaseScan,
  provider: 'openai' | 'anthropic',
  model?: string,
): Promise<string | null> {
  const agent = loadAgent('init-agent');
  const separator = pc.dim('─'.repeat(60));

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  // First turn: send scan results
  const scanMessage = JSON.stringify({
    testFiles: scan.testFiles.slice(0, 20),
    configFiles: scan.configFiles,
    fixtureFiles: scan.fixtureFiles.slice(0, 10),
    featureFiles: scan.featureFiles.slice(0, 20),
    tsconfigPaths: scan.tsconfigPaths,
    playwrightConfig: scan.playwrightConfig,
    sampleTestContent: scan.sampleTestContent,
  }, null, 2);

  messages.push({ role: 'user', content: `Here are the scan results from the project:\n\n${scanMessage}` });

  const MAX_TURNS = 5;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const userContent = messages.filter(m => m.role === 'user').map(m => m.content).join('\n\n---\n\n');

    const spinner = createSpinner();
    spinner.start('Thinking...');
    const resp = await callLLM({
      provider,
      model: model ?? agent.config.model,
      systemPrompt: agent.systemPrompt,
      userMessage: userContent,
      maxTokens: agent.config.maxTokens,
      temperature: agent.config.temperature,
    });
    spinner.stop();

    const assistantContent = resp.content.trim();
    messages.push({ role: 'assistant', content: assistantContent });

    // Check if agent produced final context
    const contextMatch = assistantContent.match(/<context>([\s\S]*?)<\/context>/);
    if (contextMatch) {
      return contextMatch[1].trim();
    }

    // Display agent's message with visual separators
    console.log('\n' + separator);
    console.log(assistantContent);
    console.log(separator + '\n');

    const answer = await input({
      message: 'Your answer (or "done" to let the agent finalize)',
    });

    if (answer.toLowerCase() === 'done') {
      messages.push({ role: 'user', content: 'Please produce the final context document now based on what you know. Wrap it in <context> tags.' });
    } else {
      messages.push({ role: 'user', content: answer });
    }
  }

  log.warn('Max conversation turns reached. Context may be incomplete.');
  return null;
}
