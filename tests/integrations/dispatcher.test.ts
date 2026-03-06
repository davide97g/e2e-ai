import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { makeConfig } from '../_helpers/fixtures.ts';
import { resetConfigCache } from '../../src/config/loader.ts';
import { resolvePaths } from '../../src/config/paths.ts';
import { fetchIssueContext } from '../../src/integrations/index.ts';

describe('fetchIssueContext', () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'e2e-ai-dispatch-')));
    originalCwd = process.cwd();
    resetConfigCache();
    writeFileSync(join(tmp, 'e2e-ai.config.ts'), 'export default {}');
    process.chdir(tmp);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    resetConfigCache();
    rmSync(tmp, { recursive: true, force: true });
  });

  test('returns null when inputSource is none', async () => {
    const config = makeConfig({ inputSource: 'none' });
    const paths = resolvePaths(config, 'PROJ-101');
    const result = await fetchIssueContext('PROJ-101', config, paths);
    expect(result).toBeNull();
  });

  test('returns null when inputSource is linear (stub)', async () => {
    const config = makeConfig({ inputSource: 'linear' });
    const paths = resolvePaths(config, 'LIN-42');
    const result = await fetchIssueContext('LIN-42', config, paths);
    expect(result).toBeNull();
  });

  test('returns null when jira JSON file does not exist', async () => {
    const config = makeConfig({ inputSource: 'jira' });
    const paths = resolvePaths(config, 'PROJ-101');
    const result = await fetchIssueContext('PROJ-101', config, paths);
    expect(result).toBeNull();
  });

  test('returns jira context from JSON file', async () => {
    const config = makeConfig({ inputSource: 'jira' });
    const paths = resolvePaths(config, 'PROJ-101');

    // Create the expected JSON file
    const keyDir = join(tmp, '.e2e-ai', 'PROJ-101');
    mkdirSync(keyDir, { recursive: true });
    writeFileSync(
      join(keyDir, 'PROJ-101-zephyr-test-case.json'),
      JSON.stringify({ jiraContext: { summary: 'Test issue', project: 'PROJ' } }),
    );

    const result = await fetchIssueContext('PROJ-101', config, paths);
    expect(result).toEqual({ summary: 'Test issue', project: 'PROJ' });
  });

  test('falls back to issueContext field', async () => {
    const config = makeConfig({ inputSource: 'jira' });
    const paths = resolvePaths(config, 'KEY-1');

    const keyDir = join(tmp, '.e2e-ai', 'KEY-1');
    mkdirSync(keyDir, { recursive: true });
    writeFileSync(
      join(keyDir, 'KEY-1-zephyr-test-case.json'),
      JSON.stringify({ issueContext: { summary: 'From issueContext' } }),
    );

    const result = await fetchIssueContext('KEY-1', config, paths);
    expect(result).toEqual({ summary: 'From issueContext' });
  });
});
