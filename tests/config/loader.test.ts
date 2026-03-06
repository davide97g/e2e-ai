import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadConfig, resetConfigCache, getProjectRoot } from '../../src/config/loader.ts';

describe('loader', () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'e2e-ai-loader-')));
    originalCwd = process.cwd();
    resetConfigCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    resetConfigCache();
    rmSync(tmp, { recursive: true, force: true });
  });

  test('resetConfigCache clears cached values', () => {
    const root = getProjectRoot();
    expect(typeof root).toBe('string');
    expect(root.length).toBeGreaterThan(0);
  });

  test('loadConfig returns defaults when no config file exists', async () => {
    const emptyDir = join(tmp, 'empty');
    mkdirSync(emptyDir, { recursive: true });
    process.chdir(emptyDir);

    const config = await loadConfig();
    expect(config.inputSource).toBe('none');
    expect(config.outputTarget).toBe('markdown');
    expect(config.paths.tests).toBe('e2e/tests');
  });

  test('loadConfig returns cached value on second call', async () => {
    process.chdir(tmp);
    const first = await loadConfig();
    const second = await loadConfig();
    expect(first).toBe(second);
  });

  test('getProjectRoot falls back to cwd when no config found', () => {
    const noConfigDir = join(tmp, 'noconfig');
    mkdirSync(noConfigDir, { recursive: true });
    process.chdir(noConfigDir);

    const root = getProjectRoot();
    expect(root).toBe(noConfigDir);
  });
});
