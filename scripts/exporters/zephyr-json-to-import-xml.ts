/**
 * Convert a Zephyr-format test case JSON into an XML file suitable
 * for import via Zephyr's "Import from File" wizard.
 *
 * Can be used both as a CLI script and as an importable module.
 */

export type ZephyrStep = { stepNumber: number; description: string; expectedResult: string };

export type ZephyrTestCaseFile = {
  title: string;
  precondition?: string;
  steps: ZephyrStep[];
  issueKey?: string;
  issueContext?: { project?: string; summary?: string; parent?: string; labels?: unknown[]; [key: string]: unknown };
};

/** Escape content for CDATA: split ]]> so it doesn't close the section. */
function cdata(value: string): string {
  const s = String(value ?? '');
  return s.replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Derive feature/area from parent epic or first label, otherwise "General".
 */
function getFeature(data: ZephyrTestCaseFile, titlePrefix?: string): string {
  const parent = data.issueContext?.parent;
  if (parent && typeof parent === 'string') {
    const withoutKey = parent.replace(/^[A-Z][A-Z0-9]*-[0-9]+\s*/i, '').trim();
    if (withoutKey) return withoutKey;
  }
  const labels = data.issueContext?.labels;
  if (Array.isArray(labels) && labels.length > 0 && typeof labels[0] === 'string') {
    return labels[0];
  }
  return 'General';
}

/**
 * Format the full title with optional prefix.
 * Default format: "<prefix> - <feature> - <test name>"
 */
export function formatExportTitle(data: ZephyrTestCaseFile, titlePrefix?: string): string {
  const prefix = titlePrefix ?? 'UI Automation';
  const feature = getFeature(data, titlePrefix);
  const testName = (data.title ?? '').trim() || 'Untitled';
  return `${prefix} - ${feature} - ${testName}`;
}

/**
 * Convert a ZephyrTestCaseFile to Zephyr-compatible import XML.
 */
export function jsonToImportXml(data: ZephyrTestCaseFile, titlePrefix?: string): string {
  const projectKey =
    (data.issueContext?.project as string) || (data.issueKey?.split('-')[0]) || 'PROJECT';
  const exportDate = new Date().toISOString().replace('T', ' ').replace(/\.[0-9]{3}Z$/, ' UTC');
  const name = formatExportTitle(data, titlePrefix);
  const precondition = data.precondition ?? '';
  const steps = (data.steps ?? []).slice().sort((a, b) => a.stepNumber - b.stepNumber);

  const stepLines = steps.map(
    (step, i) =>
      `                    <step index="${i}">
                        <customFields/>
                        <description><![CDATA[${cdata(step.description ?? '')}]]></description>
                        <expectedResult><![CDATA[${cdata(step.expectedResult ?? '')}]]></expectedResult>
                    </step>`
  );

  const testCaseAttrs = data.issueKey ? ` key="${escapeXml(data.issueKey)}"` : '';
  const summary =
    (data.issueContext?.summary as string) || data.title || '';
  const issuesBlock = data.issueKey
    ? `<issues>
                <issue>
                    <key>${escapeXml(data.issueKey)}</key>
                    <summary><![CDATA[${cdata(summary)}]]></summary>
                </issue>
            </issues>`
    : '<issues/>';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<project>
    <projectId>0</projectId>
    <projectKey>${escapeXml(projectKey)}</projectKey>
    <exportDate>${exportDate}</exportDate>
    <testCases>
        <testCase${testCaseAttrs}>
            <attachments/>
            <confluencePageLinks/>
            <createdBy/>
            <createdOn>${exportDate}</createdOn>
            <customFields/>
            <folder><![CDATA[]]></folder>
            ${issuesBlock}
            <labels/>
            <name><![CDATA[${cdata(name)}]]></name>
            <owner/>
            <precondition><![CDATA[${cdata(precondition)}]]></precondition>
            <priority><![CDATA[Normal]]></priority>
            <status><![CDATA[Draft]]></status>
            <parameters/>
            <testDataWrapper/>
            <testScript type="steps">
                <steps>
${stepLines.join('\n')}
                </steps>
            </testScript>
        </testCase>
    </testCases>
</project>
`;
}

// CLI entry point — only runs when this file is the direct entry point
const isDirectRun = process.argv[1]?.includes('zephyr-json-to-import-xml');
if (isDirectRun) {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const outIdx = process.argv.indexOf('-o');
  const outArg = outIdx >= 0 ? process.argv[outIdx + 1] : null;

  const filePath = args[0];
  if (!filePath) {
    console.error('Usage: bun run zephyr-json-to-import-xml <test-case.json> [-o output.xml]');
    process.exit(1);
  }

  const absPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`File not found: ${absPath}`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(absPath, 'utf-8')) as ZephyrTestCaseFile;
  const xml = jsonToImportXml(raw);

  const outPath = outArg
    ? (path.isAbsolute(outArg) ? outArg : path.resolve(outArg))
    : absPath.replace(/\.json$/i, '-import.xml');

  fs.writeFileSync(outPath, xml, 'utf-8');
  console.log(`Wrote ${outPath}`);
}
