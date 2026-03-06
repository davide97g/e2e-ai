import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Command } from 'commander';
import { resolveCommandContext } from '../../src/commands/_shared.ts';
import { resetConfigCache } from '../../src/config/loader.ts';
import { mockEnv } from '../_helpers/mocks.ts';

describe('resolveCommandContext', () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'e2e-ai-cmd-')));
    originalCwd = process.cwd();
    resetConfigCache();
    writeFileSync(join(tmp, 'e2e-ai.config.ts'), 'export default {}');
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    resetConfigCache();
  });

  function makeProgram(opts: Record<string, unknown> = {}) {
    const program = new Command();
    program.option('--key <key>');
    program.option('--provider <provider>');
    program.option('--model <model>');
    program.option('--verbose');
    program.option('--no-voice');
    program.option('--no-trace');

    const args = ['node', 'cli'];
    if (opts.key) args.push('--key', String(opts.key));
    if (opts.provider) args.push('--provider', String(opts.provider));
    if (opts.model) args.push('--model', String(opts.model));
    if (opts.verbose) args.push('--verbose');
    program.parse(args);
    return program;
  }

  test('defaults to config values', async () => {
    const program = makeProgram();
    const ctx = await resolveCommandContext(program);

    expect(ctx.provider).toBe('openai');
    expect(ctx.model).toBeUndefined();
    expect(ctx.verbose).toBe(false);
  });

  test('CLI option overrides config for provider', async () => {
    const program = makeProgram({ provider: 'anthropic' });
    const ctx = await resolveCommandContext(program);
    expect(ctx.provider).toBe('anthropic');
  });

  test('env var overrides config for provider', async () => {
    const env = mockEnv({ AI_PROVIDER: 'anthropic' });
    try {
      const program = makeProgram();
      const ctx = await resolveCommandContext(program);
      expect(ctx.provider).toBe('anthropic');
    } finally {
      env.restore();
    }
  });

  test('CLI option takes priority over env var', async () => {
    const env = mockEnv({ AI_PROVIDER: 'anthropic' });
    try {
      const program = makeProgram({ provider: 'openai' });
      const ctx = await resolveCommandContext(program);
      expect(ctx.provider).toBe('openai');
    } finally {
      env.restore();
    }
  });

  test('passes key through to paths', async () => {
    const program = makeProgram({ key: 'PROJ-101' });
    const ctx = await resolveCommandContext(program);
    expect(ctx.key).toBe('PROJ-101');
    expect(ctx.paths.keyDir).toContain('PROJ-101');
  });

  test('env var overrides config for model', async () => {
    const env = mockEnv({ AI_MODEL: 'gpt-4-turbo' });
    try {
      const program = makeProgram();
      const ctx = await resolveCommandContext(program);
      expect(ctx.model).toBe('gpt-4-turbo');
    } finally {
      env.restore();
    }
  });

  test('CLI model takes priority over env var', async () => {
    const env = mockEnv({ AI_MODEL: 'gpt-4-turbo' });
    try {
      const program = makeProgram({ model: 'gpt-4o-mini' });
      const ctx = await resolveCommandContext(program);
      expect(ctx.model).toBe('gpt-4o-mini');
    } finally {
      env.restore();
    }
  });
});
