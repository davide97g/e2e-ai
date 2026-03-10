import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { globSync } from 'glob';
import { TypeScriptParser } from './parsers/typescript.ts';
import { extractRoutes } from './extractors/index.ts';
import type { ASTScanResult, FileNode, RouteNode, ComponentNode, HookNode, DependencyEdge } from './types.ts';
import * as log from '../utils/logger.ts';

export interface ScannerConfig {
  scanDir: string;
  include: string[];
  exclude: string[];
  cacheDir: string;
}

interface CacheManifest {
  files: Record<string, { hash: string; resultFile: string }>;
}

export async function runStage1(config: ScannerConfig): Promise<ASTScanResult> {
  const scanDir = resolve(config.scanDir);
  const cacheDir = resolve(config.cacheDir, 'ast');

  // Ensure cache dir exists
  mkdirSync(cacheDir, { recursive: true });

  // Load cache manifest
  const manifestPath = resolve(cacheDir, 'manifest.json');
  let manifest: CacheManifest = { files: {} };
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch {
      manifest = { files: {} };
    }
  }

  // Collect files matching include/exclude patterns
  const files = collectFiles(scanDir, config.include, config.exclude);
  log.verbose(`Found ${files.length} files to scan`);

  const parser = new TypeScriptParser();

  const allFiles: FileNode[] = [];
  const allComponents: ComponentNode[] = [];
  const allHooks: HookNode[] = [];
  const allDependencies: DependencyEdge[] = [];
  let totalLines = 0;
  let cachedCount = 0;

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf-8');
    const hash = createHash('md5').update(content).digest('hex');
    const relPath = relative(process.cwd(), filePath);

    // Check cache
    const cached = manifest.files[relPath];
    if (cached && cached.hash === hash) {
      const cacheFile = resolve(cacheDir, cached.resultFile);
      if (existsSync(cacheFile)) {
        try {
          const cachedResult = JSON.parse(readFileSync(cacheFile, 'utf-8'));
          allFiles.push(cachedResult.file);
          allComponents.push(...cachedResult.components);
          allHooks.push(...cachedResult.hooks);
          allDependencies.push(...cachedResult.dependencies);
          totalLines += cachedResult.file.lines;
          cachedCount++;
          continue;
        } catch {
          // Cache corrupted, re-parse
        }
      }
    }

    // Parse file
    const result = await parser.parse(relPath, content);

    allFiles.push(result.file);
    allComponents.push(...result.components);
    allHooks.push(...result.hooks);
    allDependencies.push(...result.dependencies);
    totalLines += result.file.lines;

    // Write to cache
    const resultFile = `${hash}.json`;
    writeFileSync(
      resolve(cacheDir, resultFile),
      JSON.stringify({
        file: result.file,
        components: result.components,
        hooks: result.hooks,
        dependencies: result.dependencies,
      }),
    );
    manifest.files[relPath] = { hash, resultFile };
  }

  // Save manifest
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  if (cachedCount > 0) {
    log.verbose(`${cachedCount} files from cache, ${files.length - cachedCount} re-parsed`);
  }

  // Extract routes separately (filesystem-based)
  const routes: RouteNode[] = extractRoutes(scanDir);
  log.verbose(`Found ${routes.length} routes`);
  log.verbose(`Found ${allComponents.length} components`);
  log.verbose(`Found ${allHooks.length} custom hooks`);

  return {
    version: '1.0',
    scannedAt: new Date().toISOString(),
    language: 'typescript',
    stats: { totalFiles: files.length, totalLines },
    files: allFiles,
    routes,
    components: allComponents,
    hooks: allHooks,
    dependencies: allDependencies,
  };
}

function collectFiles(
  dir: string,
  includePatterns: string[],
  excludePatterns: string[],
): string[] {
  const files: string[] = [];
  for (const pattern of includePatterns) {
    const matches = globSync(pattern, {
      cwd: dir,
      absolute: true,
      ignore: excludePatterns,
    });
    files.push(...matches);
  }

  return [...new Set(files)].sort();
}
