#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { setVerbose } from './utils/logger.ts';
import { registerRecord } from './commands/record.ts';
import { registerTranscribe } from './commands/transcribe.ts';
import { registerScenario } from './commands/scenario.ts';
import { registerGenerate } from './commands/generate.ts';
import { registerRefine } from './commands/refine.ts';
import { registerTest } from './commands/test.ts';
import { registerHeal } from './commands/heal.ts';
import { registerQa } from './commands/qa.ts';
import { registerRun } from './commands/run.ts';
import { registerInit } from './commands/init.ts';

const program = new Command();

program
  .name('e2e-ai')
  .description('AI-powered E2E test automation pipeline')
  .version('1.0.0')
  .option('-k, --key <KEY>', 'Issue key (e.g., PROJ-101, LIN-42)')
  .option('--provider <provider>', 'LLM provider (openai|anthropic)', process.env.AI_PROVIDER)
  .option('--model <model>', 'LLM model override', process.env.AI_MODEL)
  .option('-v, --verbose', 'Verbose output')
  .option('--no-voice', 'Disable voice recording')
  .option('--no-trace', 'Disable trace replay')
  .hook('preAction', () => {
    if (program.opts().verbose) {
      setVerbose(true);
    }
  });

registerInit(program);
registerRecord(program);
registerTranscribe(program);
registerScenario(program);
registerGenerate(program);
registerRefine(program);
registerTest(program);
registerHeal(program);
registerQa(program);
registerRun(program);

program.parse();
