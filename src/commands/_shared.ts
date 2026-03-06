import type { Command } from 'commander';
import { loadConfig } from '../config/loader.ts';
import { resolvePaths, type ResolvedPaths } from '../config/paths.ts';
import type { ResolvedConfig } from '../config/schema.ts';

export interface CommandContext {
  key?: string;
  provider: 'openai' | 'anthropic';
  model?: string;
  verbose: boolean;
  voice: boolean;
  trace: boolean;
  config: ResolvedConfig;
  paths: ResolvedPaths;
}

/**
 * Resolve common command context from CLI options + config file.
 */
export async function resolveCommandContext(program: Command): Promise<CommandContext> {
  const opts = program.opts();
  const config = await loadConfig();

  const key = opts.key;
  const paths = resolvePaths(config, key);
  const provider = (opts.provider ?? process.env.AI_PROVIDER ?? config.llm.provider) as 'openai' | 'anthropic';
  const model = opts.model ?? process.env.AI_MODEL ?? config.llm.model ?? undefined;

  return {
    key,
    provider,
    model,
    verbose: opts.verbose ?? false,
    voice: opts.voice !== false && config.voice.enabled,
    trace: opts.trace !== false,
    config,
    paths,
  };
}
