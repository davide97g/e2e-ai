import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface CodebaseScan {
  testFiles: string[];
  configFiles: string[];
  fixtureFiles: string[];
  featureFiles: string[];
  tsconfigPaths: Record<string, string[]>;
  playwrightConfig: string | null;
  sampleTestContent: string | null;
}

export async function scanCodebase(root: string): Promise<CodebaseScan> {
  const scan: CodebaseScan = {
    testFiles: [],
    configFiles: [],
    fixtureFiles: [],
    featureFiles: [],
    tsconfigPaths: {},
    playwrightConfig: null,
    sampleTestContent: null,
  };

  // Recursive file finder
  function walk(dir: string, depth = 0): string[] {
    if (depth > 5) return [];
    const files: string[] = [];
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...walk(full, depth + 1));
        } else {
          files.push(full);
        }
      }
    } catch {}
    return files;
  }

  const allFiles = walk(root);

  for (const file of allFiles) {
    const rel = relative(root, file);
    if (rel.endsWith('.test.ts') || rel.endsWith('.spec.ts')) {
      scan.testFiles.push(rel);
      if (!scan.sampleTestContent && scan.testFiles.length <= 3) {
        try { scan.sampleTestContent = readFileSync(file, 'utf-8').slice(0, 3000); } catch {}
      }
    }
    if (rel.endsWith('.feature.ts')) scan.featureFiles.push(rel);
    if (rel.includes('fixture') && rel.endsWith('.ts')) scan.fixtureFiles.push(rel);
    if (rel === 'playwright.config.ts' || rel === 'playwright.config.js') scan.playwrightConfig = rel;
    if (rel === 'tsconfig.json' || rel.endsWith('/tsconfig.json')) {
      try {
        const tsconfig = JSON.parse(readFileSync(file, 'utf-8'));
        if (tsconfig.compilerOptions?.paths) {
          scan.tsconfigPaths = { ...scan.tsconfigPaths, ...tsconfig.compilerOptions.paths };
        }
      } catch {}
    }
  }

  // Look for config files
  for (const name of ['playwright.config.ts', 'vitest.config.ts', 'jest.config.ts', 'tsconfig.json', 'package.json']) {
    if (existsSync(join(root, name))) scan.configFiles.push(name);
  }

  return scan;
}
