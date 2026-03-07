import type { Command } from 'commander';
import { join } from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { select, confirm, input } from '@inquirer/prompts';
import pc from 'picocolors';
import { writeFile, fileExists, ensureDir } from '../utils/fs.ts';
import { getProjectRoot, getPackageRoot } from '../config/loader.ts';
import { scanCodebase, type CodebaseScan } from '../utils/scan.ts';
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

      // Part B: Generate instructions + copy agents
      const spinner = createSpinner();
      spinner.start('Scanning codebase for test patterns...');
      const scan = await scanCodebase(projectRoot);
      spinner.stop();

      if (scan.testFiles.length === 0 && scan.configFiles.length === 0) {
        log.warn('No test files found. Scan results will be minimal.');
      } else {
        log.info(`Found ${scan.testFiles.length} test files, ${scan.configFiles.length} config files`);
      }

      // 3a: Generate instructions file
      const instructionsContent = generateInstructionsFile(scan);
      const instructionsPath = join(projectRoot, 'e2e-ai.instructions.md');
      writeFile(instructionsPath, instructionsContent);
      log.success(`Instructions written: ${instructionsPath}`);

      // 3b: Copy agents to .e2e-ai/agents/
      const copiedCount = await copyAgentsToLocal(projectRoot, !!cmdOpts?.nonInteractive);

      // 3c: Print next steps
      console.log('');
      log.success('Initialization complete!\n');
      console.log(pc.bold('Next steps:'));
      console.log(`  1. Open ${pc.cyan('e2e-ai.instructions.md')} with your AI tool`);
      console.log(`  2. Review the generated ${pc.cyan('.e2e-ai/context.md')}`);
      console.log(`  3. Customize agents in ${pc.cyan('.e2e-ai/agents/')} if needed`);
      console.log(`  4. Run: ${pc.cyan('e2e-ai run --key PROJ-101')}`);
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
    contextFile: '.e2e-ai/context.md',
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

function generateInstructionsFile(scan: CodebaseScan): string {
  const packageRoot = getPackageRoot();
  const sections: string[] = [];

  // Header
  sections.push(`# e2e-ai: Context Generation Instructions

This file was generated by \`e2e-ai init\`. It contains everything an AI tool needs to generate \`.e2e-ai/context.md\` for your project.

## How to Use

1. Open this file in your AI tool (Claude Code, Cursor, Gemini CLI, etc.)
2. Ask it to follow these instructions to generate \`.e2e-ai/context.md\`
3. Review the generated file and adjust as needed

Alternatively, if the e2e-ai MCP server is configured, your AI tool can call \`e2e_ai_scan_codebase\` and \`e2e_ai_validate_context\` directly.

---`);

  // Task
  sections.push(`## Task

Scan this codebase and generate a file at \`.e2e-ai/context.md\` that documents the project's test infrastructure, conventions, and patterns. This context file is consumed by downstream AI agents (scenario, generator, refiner, healer, QA) to produce Playwright tests that match the project's existing style.`);

  // Embedded scan results
  sections.push(`## Codebase Scan Results

The following was pre-computed during \`e2e-ai init\`:

### Test Files (${scan.testFiles.length} found)
${scan.testFiles.length > 0 ? scan.testFiles.slice(0, 20).map(f => `- \`${f}\``).join('\n') : '_No test files found_'}
${scan.testFiles.length > 20 ? `\n_(${scan.testFiles.length - 20} more not shown)_` : ''}

### Config Files
${scan.configFiles.length > 0 ? scan.configFiles.map(f => `- \`${f}\``).join('\n') : '_None found_'}

### Fixture Files
${scan.fixtureFiles.length > 0 ? scan.fixtureFiles.slice(0, 10).map(f => `- \`${f}\``).join('\n') : '_None found_'}

### Feature Files
${scan.featureFiles.length > 0 ? scan.featureFiles.slice(0, 20).map(f => `- \`${f}\``).join('\n') : '_None found_'}

### Path Aliases (from tsconfig.json)
${Object.keys(scan.tsconfigPaths).length > 0 ? Object.entries(scan.tsconfigPaths).map(([alias, targets]) => `- \`${alias}\` -> \`${targets.join(', ')}\``).join('\n') : '_None configured_'}

### Playwright Config
${scan.playwrightConfig ? `Found: \`${scan.playwrightConfig}\`` : '_Not found_'}

### Sample Test Content
${scan.sampleTestContent ? '```typescript\n' + scan.sampleTestContent + '\n```' : '_No sample available_'}`);

  // What to look for — from init-agent.md
  let agentChecklist = '';
  try {
    const agentContent = readFileSync(join(packageRoot, 'agents', 'init-agent.md'), 'utf-8');
    const bodyMatch = agentContent.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    if (bodyMatch) {
      agentChecklist = bodyMatch[1].trim();
    }
  } catch {}

  if (agentChecklist) {
    sections.push(`## What to Look For

The following guidance comes from the e2e-ai init agent:

${agentChecklist}`);
  }

  // Output format spec
  sections.push(`## Output Format

The generated \`.e2e-ai/context.md\` MUST contain these sections:

\`\`\`markdown
# Project Context for e2e-ai

## Application
<name, description, tech stack, base URL>

## Test Infrastructure
<fixtures, helpers, auth pattern>

## Feature Methods
<method signatures grouped by module>

## Import Conventions
<path aliases, standard imports>

## Selector Conventions
<preferred selector strategies, patterns>

## Test Structure Template
<code template showing standard test layout>

## Utility Patterns
<timeouts, waits, assertion patterns>
\`\`\`

All sections are required. The file should be 100-300 lines, self-contained, and use actual code from the project (not generic Playwright examples).`);

  // Pipeline context
  sections.push(`## How Context is Used

Each pipeline agent reads \`.e2e-ai/context.md\` to understand project conventions:

| Agent | Uses context for |
|-------|-----------------|
| **scenario-agent** | Structuring test steps to match project patterns |
| **playwright-generator-agent** | Generating code with correct imports, fixtures, selectors |
| **refactor-agent** | Applying project-specific refactoring patterns |
| **self-healing-agent** | Understanding expected test structure when fixing failures |
| **qa-testcase-agent** | Formatting QA documentation to match conventions |`);

  // Complete example
  let exampleContent = '';
  try {
    exampleContent = readFileSync(join(packageRoot, 'templates', 'e2e-ai.context.example.md'), 'utf-8');
  } catch {}

  if (exampleContent) {
    sections.push(`## Complete Example

Below is a full example of a well-structured context file:

${exampleContent}`);
  }

  return sections.join('\n\n');
}

async function copyAgentsToLocal(projectRoot: string, nonInteractive: boolean): Promise<number> {
  const packageRoot = getPackageRoot();
  const sourceDir = join(packageRoot, 'agents');
  const targetDir = join(projectRoot, '.e2e-ai', 'agents');

  let agentFiles: string[];
  try {
    agentFiles = readdirSync(sourceDir).filter(f => f.endsWith('.md'));
  } catch {
    log.warn('Could not read package agents directory');
    return 0;
  }

  if (agentFiles.length === 0) return 0;

  // Check if target already has files
  const targetExists = existsSync(targetDir);
  if (targetExists) {
    const existingFiles = readdirSync(targetDir).filter(f => f.endsWith('.md'));
    if (existingFiles.length > 0) {
      if (nonInteractive) {
        log.info('Agent files already exist in .e2e-ai/agents/, skipping');
        return 0;
      }
      const overwrite = await confirm({
        message: `Agent files already exist in .e2e-ai/agents/ (${existingFiles.length} files). Overwrite?`,
        default: false,
      });
      if (!overwrite) {
        log.info('Skipping agent copy');
        return 0;
      }
    }
  }

  ensureDir(targetDir);
  for (const file of agentFiles) {
    const content = readFileSync(join(sourceDir, file), 'utf-8');
    writeFile(join(targetDir, file), content);
  }

  log.success(`Agents copied to .e2e-ai/agents/ (${agentFiles.length} files)`);
  return agentFiles.length;
}
