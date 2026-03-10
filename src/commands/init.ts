import type { Command } from 'commander';
import { join } from 'node:path';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { select, confirm, input } from '@inquirer/prompts';
import pc from 'picocolors';
import { writeFile, fileExists, ensureDir } from '../utils/fs.ts';
import { getProjectRoot, getPackageRoot } from '../config/loader.ts';
import * as log from '../utils/logger.ts';

export function registerInit(program: Command) {
  program
    .command('init')
    .description('Initialize e2e-ai configuration for your project')
    .option('--non-interactive', 'Skip interactive prompts, use defaults')
    .action(async (cmdOpts?: any) => {
      const projectRoot = getProjectRoot();
      const e2eDir = join(projectRoot, '.e2e-ai');
      const nonInteractive = !!cmdOpts?.nonInteractive;
      const configPath = join(e2eDir, 'config.ts');
      const isReInit = fileExists(configPath);

      log.header('e2e-ai init');

      if (isReInit) {
        // --- Re-init: preserve config + context, only update agents & workflow ---
        log.info('Existing .e2e-ai/ detected — preserving config and context.\n');

        await copyAgentsToLocal(projectRoot, nonInteractive);
        await copyWorkflowGuide(projectRoot, nonInteractive);
      } else {
        // --- Fresh init: config + agents + workflow ---
        const answers = nonInteractive
          ? getDefaultAnswers()
          : await askConfigQuestions();

        const config = buildConfigFromAnswers(answers);
        writeFile(configPath, generateConfigFile(config));
        log.success(`Config written: ${configPath}`);

        await copyAgentsToLocal(projectRoot, nonInteractive);
        await copyWorkflowGuide(projectRoot, nonInteractive);
      }

      // Print next steps
      console.log('');
      log.success('Initialization complete!\n');
      if (!isReInit) {
        console.log(pc.bold('Next steps:'));
        console.log(`  1. Use the ${pc.cyan('init-agent')} in your AI tool to generate ${pc.cyan('.e2e-ai/context.md')}`);
        console.log(`     (or use the MCP server: ${pc.cyan('e2e_ai_scan_codebase')} + ${pc.cyan('e2e_ai_read_agent')})`);
        console.log(`  2. Review the generated ${pc.cyan('.e2e-ai/context.md')}`);
        console.log(`  3. Run: ${pc.cyan('e2e-ai run --key PROJ-101')}`);
      } else {
        console.log(pc.dim('Config and context.md were preserved. Only agents and workflow were checked.'));
      }
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
        message: `Update agents to latest version? (${agentFiles.length} files, currently ${existingFiles.length} in .e2e-ai/agents/)`,
        default: true,
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

async function copyWorkflowGuide(projectRoot: string, nonInteractive: boolean) {
  const packageRoot = getPackageRoot();
  const source = join(packageRoot, 'templates', 'workflow.md');
  const target = join(projectRoot, '.e2e-ai', 'workflow.md');

  if (!existsSync(source)) return;

  if (existsSync(target)) {
    if (nonInteractive) {
      log.info('Workflow guide already exists, skipping');
      return;
    }
    const overwrite = await confirm({
      message: 'Update workflow.md to latest version?',
      default: true,
    });
    if (!overwrite) {
      log.info('Skipping workflow guide update');
      return;
    }
  }

  const content = readFileSync(source, 'utf-8');
  writeFile(target, content);
  log.success('Workflow guide written to .e2e-ai/workflow.md');
}
