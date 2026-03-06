import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getProjectRoot, getPackageRoot } from '../config/loader.ts';

export function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readFile(filePath: string): string {
  return readFileSync(filePath, 'utf-8');
}

export function writeFile(filePath: string, content: string) {
  ensureDir(dirname(filePath));
  writeFileSync(filePath, content, 'utf-8');
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function projectRoot(): string {
  return getProjectRoot();
}

export function packageRoot(): string {
  return getPackageRoot();
}

export function resolveFromRoot(...segments: string[]): string {
  return join(projectRoot(), ...segments);
}

export function findFileWithPattern(dir: string, pattern: RegExp): string | undefined {
  if (!existsSync(dir)) return undefined;
  const files = readdirSync(dir).filter((f) => pattern.test(f)).sort();
  const match = files.length > 0 ? files[files.length - 1] : undefined;
  return match ? join(dir, match) : undefined;
}

export function timestampSuffix(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
