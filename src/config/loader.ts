import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { E2eAiConfigSchema, type ResolvedConfig } from './schema.ts';

const CONFIG_DIR = '.e2e-ai';
const CONFIG_FILENAMES = ['config.ts', 'config.js', 'config.mjs'];

let cachedConfig: ResolvedConfig | null = null;
let cachedProjectRoot: string | null = null;

/**
 * Search upward from `startDir` for a `.e2e-ai/` directory containing a config file.
 * Returns the project directory (parent of `.e2e-ai/`), or null.
 */
function findConfigDir(startDir: string): string | null {
  let dir = resolve(startDir);
  const root = dirname(dir) === dir ? dir : undefined; // filesystem root

  while (true) {
    const e2eDir = join(dir, CONFIG_DIR);
    for (const name of CONFIG_FILENAMES) {
      if (existsSync(join(e2eDir, name))) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir || dir === root) return null;
    dir = parent;
  }
}

/**
 * Discover project root: the directory containing `.e2e-ai/config.*`.
 * Falls back to `process.cwd()` if no config file is found.
 */
export function getProjectRoot(): string {
  if (cachedProjectRoot) return cachedProjectRoot;
  const found = findConfigDir(process.cwd());
  cachedProjectRoot = found ?? process.cwd();
  return cachedProjectRoot;
}

/**
 * Resolve the package root (where the e2e-ai package itself lives).
 * Works both in development (src/config/) and when bundled (dist/).
 * Walks up from the current file's directory until it finds package.json.
 */
export function getPackageRoot(): string {
  let dir = import.meta.dirname;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) return dir;
    dir = parent;
  }
  return dir;
}

/**
 * Load, validate, and cache the user config.
 * Looks for `.e2e-ai/config.{ts,js,mjs}` in the project root.
 * Merges user values with schema defaults via Zod.
 */
export async function loadConfig(): Promise<ResolvedConfig> {
  if (cachedConfig) return cachedConfig;

  const projectRoot = getProjectRoot();
  const e2eDir = join(projectRoot, CONFIG_DIR);
  let userConfig: Record<string, unknown> = {};

  for (const name of CONFIG_FILENAMES) {
    const configPath = join(e2eDir, name);
    if (existsSync(configPath)) {
      try {
        const fileUrl = pathToFileURL(configPath).href;
        const mod = await import(fileUrl);
        userConfig = mod.default ?? mod;
        break;
      } catch {
        // If import fails, continue with defaults
      }
    }
  }

  // Zod parse applies defaults for missing fields
  cachedConfig = E2eAiConfigSchema.parse(userConfig);
  return cachedConfig;
}

/**
 * Reset cached config (useful for testing or re-initialization).
 */
export function resetConfigCache(): void {
  cachedConfig = null;
  cachedProjectRoot = null;
}
