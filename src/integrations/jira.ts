import { join } from 'node:path';
import { fileExists, readFile } from '../utils/fs.ts';
import type { ResolvedConfig } from '../config/schema.ts';

/**
 * Fetch issue context from local JSON files (current behavior).
 * Reads the Zephyr test case JSON from the working directory.
 */
export async function fetchJiraContext(
  key: string,
  config: ResolvedConfig,
  workingDir: string,
): Promise<Record<string, unknown> | null> {
  const jsonPath = join(workingDir, key, `${key}-zephyr-test-case.json`);
  if (!fileExists(jsonPath)) return null;

  const data = JSON.parse(readFile(jsonPath));
  return data.jiraContext ?? data.issueContext ?? null;
}
