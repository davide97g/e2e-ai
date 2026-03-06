import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeConfig } from '../_helpers/fixtures.ts';
import { resolvePaths } from '../../src/config/paths.ts';
import { resetConfigCache } from '../../src/config/loader.ts';

describe('resolvePaths', () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'e2e-ai-paths-')));
    originalCwd = process.cwd();
    resetConfigCache();
    // Write a fake config so getProjectRoot resolves to tmp
    writeFileSync(join(tmp, 'e2e-ai.config.ts'), 'export default {}');
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    resetConfigCache();
    rmSync(tmp, { recursive: true, force: true });
  });

  test('returns all base paths without key', () => {
    const config = makeConfig();
    const paths = resolvePaths(config);

    expect(paths.projectRoot).toBe(tmp);
    expect(paths.workingDir).toBe(join(tmp, '.e2e-ai'));
    expect(paths.testsDir).toBe(join(tmp, 'e2e/tests'));
    expect(paths.recordingsDir).toBe(join(tmp, 'e2e/recordings'));
    expect(paths.transcriptsDir).toBe(join(tmp, 'e2e/transcripts'));
    expect(paths.tracesDir).toBe(join(tmp, 'e2e/traces'));
    expect(paths.qaDir).toBe(join(tmp, 'qa'));
  });

  test('key-specific paths are null when no key', () => {
    const config = makeConfig();
    const paths = resolvePaths(config);

    expect(paths.keyDir).toBeNull();
    expect(paths.testDir).toBeNull();
    expect(paths.testFile).toBeNull();
    expect(paths.scenarioDir).toBeNull();
    expect(paths.scenarioFile).toBeNull();
    expect(paths.qaFile).toBeNull();
  });

  test('key-specific paths are populated when key provided', () => {
    const config = makeConfig();
    const paths = resolvePaths(config, 'PROJ-101');

    expect(paths.keyDir).toBe(join(tmp, '.e2e-ai/PROJ-101'));
    expect(paths.testDir).toBe(join(tmp, 'e2e/tests/PROJ-101'));
    expect(paths.testFile).toBe(join(tmp, 'e2e/tests/PROJ-101/PROJ-101.test.ts'));
    expect(paths.scenarioFile).toBe(join(tmp, 'e2e/tests/PROJ-101/PROJ-101.yaml'));
    expect(paths.qaFile).toBe(join(tmp, 'qa/PROJ-101.md'));
  });

  test('zephyr paths are null when outputTarget is markdown', () => {
    const config = makeConfig({ outputTarget: 'markdown' });
    const paths = resolvePaths(config, 'PROJ-101');

    expect(paths.zephyrJsonFile).toBeNull();
    expect(paths.zephyrXmlFile).toBeNull();
  });

  test('zephyr paths present when outputTarget is zephyr', () => {
    const config = makeConfig({ outputTarget: 'zephyr' });
    const paths = resolvePaths(config, 'PROJ-101');

    expect(paths.zephyrJsonFile).toBe(join(tmp, '.e2e-ai/PROJ-101/PROJ-101-zephyr-test-case.json'));
    expect(paths.zephyrXmlFile).toBe(join(tmp, 'e2e/tests/PROJ-101/PROJ-101-zephyr-import.xml'));
  });

  test('zephyr paths present when outputTarget is both', () => {
    const config = makeConfig({ outputTarget: 'both' });
    const paths = resolvePaths(config, 'PROJ-101');

    expect(paths.zephyrJsonFile).not.toBeNull();
    expect(paths.zephyrXmlFile).not.toBeNull();
  });

  test('zephyr paths null when outputTarget is zephyr but no key', () => {
    const config = makeConfig({ outputTarget: 'zephyr' });
    const paths = resolvePaths(config);

    expect(paths.zephyrJsonFile).toBeNull();
    expect(paths.zephyrXmlFile).toBeNull();
  });

  test('respects custom path config', () => {
    const config = makeConfig();
    config.paths.tests = 'custom/tests';
    config.paths.workingDir = '.custom';
    const paths = resolvePaths(config, 'KEY-1');

    expect(paths.testsDir).toBe(join(tmp, 'custom/tests'));
    expect(paths.workingDir).toBe(join(tmp, '.custom'));
    expect(paths.testFile).toBe(join(tmp, 'custom/tests/KEY-1/KEY-1.test.ts'));
  });
});
