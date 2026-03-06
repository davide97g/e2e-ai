import { join } from 'node:path';
import type { ResolvedConfig } from './schema.ts';
import { getProjectRoot } from './loader.ts';

export interface ResolvedPaths {
  projectRoot: string;
  workingDir: string;
  keyDir: string | null;
  testsDir: string;
  testDir: string | null;
  testFile: string | null;
  scenarioDir: string | null;
  scenarioFile: string | null;
  recordingsDir: string;
  transcriptsDir: string;
  tracesDir: string;
  qaDir: string;
  qaFile: string | null;
  zephyrJsonFile: string | null;
  zephyrXmlFile: string | null;
}

/**
 * Resolve all project paths from config. If `key` is provided, paths include
 * key-specific subdirectories.
 */
export function resolvePaths(config: ResolvedConfig, key?: string): ResolvedPaths {
  const root = getProjectRoot();

  const workingDir = join(root, config.paths.workingDir);
  const testsDir = join(root, config.paths.tests);
  const recordingsDir = join(root, config.paths.recordings);
  const transcriptsDir = join(root, config.paths.transcripts);
  const tracesDir = join(root, config.paths.traces);
  const qaDir = join(root, config.paths.qaOutput);

  const keyDir = key ? join(workingDir, key) : null;
  const testDir = key ? join(testsDir, key) : null;
  const testFile = key ? join(testsDir, key, `${key}.test.ts`) : null;
  const scenarioDir = key ? join(testsDir, key) : null;
  const scenarioFile = key ? join(testsDir, key, `${key}.yaml`) : null;
  const qaFile = key ? join(qaDir, `${key}.md`) : null;

  const needsZephyr =
    config.outputTarget === 'zephyr' || config.outputTarget === 'both';
  const zephyrJsonFile =
    needsZephyr && key ? join(workingDir, key, `${key}-zephyr-test-case.json`) : null;
  const zephyrXmlFile =
    needsZephyr && key ? join(testsDir, key, `${key}-zephyr-import.xml`) : null;

  return {
    projectRoot: root,
    workingDir,
    keyDir,
    testsDir,
    testDir,
    testFile,
    scenarioDir,
    scenarioFile,
    recordingsDir,
    transcriptsDir,
    tracesDir,
    qaDir,
    qaFile,
    zephyrJsonFile,
    zephyrXmlFile,
  };
}
