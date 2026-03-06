import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { E2eAiConfigSchema, type ResolvedConfig } from './schema.ts';

const CONFIG_FILENAMES = ['e2e-ai.config.ts', 'e2e-ai.config.js', 'e2e-ai.config.mjs'];

let cachedConfig: ResolvedConfig | null = null;
let cachedProjectRoot: string | null = null;

/**
 * Search upward from `startDir` for a config file.
 * Returns the directory containing it, or null.
 */
function findConfigDir(startDir: string): string | null {
  let dir = resolve(startDir);
  const root = dirname(dir) === dir ? dir : undefined; // filesystem root

  while (true) {
    for (const name of CONFIG_FILENAMES) {
      if (existsSync(join(dir, name))) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir || dir === root) return null;
    dir = parent;
  }
}

/**
 * Discover project root: the directory containing `e2e-ai.config.*`.
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
 * Works both in development (monorepo) and when installed in node_modules.
 */
export function getPackageRoot(): string {
  // import.meta.dirname points to the directory of this file: src/config/
  // Package root is two levels up: src/config/ -> src/ -> packages/e2e-ai/
  return resolve(import.meta.dirname, '..', '..');
}

/**
 * Load, validate, and cache the user config.
 * Merges user values with schema defaults via Zod.
 */
export async function loadConfig(): Promise<ResolvedConfig> {
  if (cachedConfig) return cachedConfig;

  const projectRoot = getProjectRoot();
  let userConfig: Record<string, unknown> = {};

  for (const name of CONFIG_FILENAMES) {
    const configPath = join(projectRoot, name);
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
