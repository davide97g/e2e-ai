import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileExists, findFileWithPattern, ensureDir, readFile, timestampSuffix } from '../../src/utils/fs.ts';

describe('fileExists', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'e2e-ai-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test('returns true for existing file', () => {
    writeFileSync(join(tmp, 'file.txt'), 'content');
    expect(fileExists(join(tmp, 'file.txt'))).toBe(true);
  });

  test('returns false for non-existing file', () => {
    expect(fileExists(join(tmp, 'nope.txt'))).toBe(false);
  });
});

describe('findFileWithPattern', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'e2e-ai-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test('returns undefined for non-existing directory', () => {
    expect(findFileWithPattern('/no/such/dir', /\.json$/)).toBeUndefined();
  });

  test('returns undefined when no files match', () => {
    writeFileSync(join(tmp, 'file.txt'), '');
    expect(findFileWithPattern(tmp, /\.json$/)).toBeUndefined();
  });

  test('returns matching file path', () => {
    writeFileSync(join(tmp, 'data.json'), '{}');
    expect(findFileWithPattern(tmp, /\.json$/)).toBe(join(tmp, 'data.json'));
  });

  test('returns last sorted match (latest alphabetically)', () => {
    writeFileSync(join(tmp, 'a-recording.webm'), '');
    writeFileSync(join(tmp, 'b-recording.webm'), '');
    expect(findFileWithPattern(tmp, /\.webm$/)).toBe(join(tmp, 'b-recording.webm'));
  });
});

describe('ensureDir', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'e2e-ai-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test('creates nested directories', () => {
    const deep = join(tmp, 'a', 'b', 'c');
    ensureDir(deep);
    expect(fileExists(deep)).toBe(true);
  });

  test('does not throw for existing directory', () => {
    ensureDir(tmp);
  });
});

describe('readFile', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'e2e-ai-test-'));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test('returns file contents as string', () => {
    const p = join(tmp, 'hello.txt');
    writeFileSync(p, 'hello world');
    expect(readFile(p)).toBe('hello world');
  });
});

describe('timestampSuffix', () => {
  test('returns YYYYMMDD-HHMMSS format', () => {
    const result = timestampSuffix();
    expect(result).toMatch(/^\d{8}-\d{6}$/);
  });
});
