import type { ResolvedConfig } from '../config/schema.ts';
import type { ResolvedPaths } from '../config/paths.ts';
import { writeFile, ensureDir } from '../utils/fs.ts';
import { dirname } from 'node:path';
import { fetchJiraContext } from './jira.ts';
import { fetchLinearContext } from './linear.ts';
import { generateZephyrXml, type ZephyrTestCaseFile } from './zephyr.ts';

/**
 * Fetch issue context from the configured input source.
 */
export async function fetchIssueContext(
  key: string,
  config: ResolvedConfig,
  paths: ResolvedPaths,
): Promise<Record<string, unknown> | null> {
  switch (config.inputSource) {
    case 'jira':
      return fetchJiraContext(key, config, paths.workingDir);
    case 'linear':
      return fetchLinearContext(key, config);
    case 'none':
      return null;
  }
}

/**
 * Generate QA export(s) based on the configured output target.
 */
export async function generateQaExport(
  data: { markdown?: string; testCase?: ZephyrTestCaseFile },
  key: string,
  config: ResolvedConfig,
  paths: ResolvedPaths,
): Promise<void> {
  const needsZephyr = config.outputTarget === 'zephyr' || config.outputTarget === 'both';
  const needsMarkdown = config.outputTarget === 'markdown' || config.outputTarget === 'both';

  if (needsZephyr && data.testCase && paths.zephyrXmlFile) {
    const titlePrefix = config.integrations.zephyr?.titlePrefix;
    await generateZephyrXml(data.testCase, paths.zephyrXmlFile, titlePrefix);

    // Also save the intermediate JSON
    if (paths.zephyrJsonFile) {
      ensureDir(dirname(paths.zephyrJsonFile));
      writeFile(paths.zephyrJsonFile, JSON.stringify(data.testCase, null, 2));
    }
  }

  if (needsMarkdown && data.markdown && paths.qaFile) {
    ensureDir(dirname(paths.qaFile));
    writeFile(paths.qaFile, data.markdown);
  }
}
