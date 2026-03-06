import { writeFile, ensureDir } from '../utils/fs.ts';
import { dirname } from 'node:path';
import { jsonToImportXml, type ZephyrTestCaseFile } from '../../scripts/exporters/zephyr-json-to-import-xml.ts';

export type { ZephyrTestCaseFile, ZephyrStep } from '../../scripts/exporters/zephyr-json-to-import-xml.ts';

/**
 * Generate Zephyr import XML from a test case object and write it to disk.
 */
export async function generateZephyrXml(
  testCase: ZephyrTestCaseFile,
  outputPath: string,
  titlePrefix?: string,
): Promise<void> {
  const xml = jsonToImportXml(testCase, titlePrefix);
  ensureDir(dirname(outputPath));
  writeFile(outputPath, xml);
}
