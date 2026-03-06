import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AGENT_MD_FIXTURE, makeConfig } from '../_helpers/fixtures.ts';
import { resetConfigCache } from '../../src/config/loader.ts';
import { loadAgent } from '../../src/agents/loadAgent.ts';

describe('loadAgent', () => {
  let tmp: string;
  let originalCwd: string;
  let agentsDir: string;

  beforeEach(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'e2e-ai-agent-')));
    originalCwd = process.cwd();
    resetConfigCache();

    // Set up a fake package structure — loadAgent reads from getPackageRoot()/agents/
    // We need to use the real agents/ dir from the project, or write to a tmp one
    agentsDir = join(tmp, 'agents');
    mkdirSync(agentsDir, { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    resetConfigCache();
    rmSync(tmp, { recursive: true, force: true });
  });

  test('throws when agent file not found with path in message', () => {
    // loadAgent uses getPackageRoot() which resolves from import.meta.dirname
    // We can't easily redirect that, so test with a non-existent agent name
    expect(() => loadAgent('nonexistent-agent-xyz')).toThrow(/Agent file not found/);
  });

  test('error message includes the full file path', () => {
    try {
      loadAgent('nonexistent-agent-xyz');
    } catch (e: any) {
      expect(e.message).toContain('nonexistent-agent-xyz.md');
    }
  });
});

describe('parseFrontmatter (via loadAgent)', () => {
  // We test frontmatter parsing indirectly by loading real agent files
  // Check that agents/ dir in the project has at least one .md file

  test('loads agent from real agents directory', () => {
    const { readdirSync } = require('node:fs');
    const { getPackageRoot } = require('../../src/config/loader.ts');
    const pkgRoot = getPackageRoot();
    const realAgentsDir = join(pkgRoot, 'agents');

    let agentFiles: string[];
    try {
      agentFiles = readdirSync(realAgentsDir).filter((f: string) => f.endsWith('.md'));
    } catch {
      // No agents dir in package root — skip
      return;
    }

    if (agentFiles.length === 0) return;

    const agentName = agentFiles[0].replace('.md', '');
    const prompt = loadAgent(agentName);

    expect(prompt.name).toBeTruthy();
    expect(prompt.systemPrompt).toBeTruthy();
    expect(prompt.config).toBeDefined();
    expect(typeof prompt.config.maxTokens).toBe('number');
    expect(typeof prompt.config.temperature).toBe('number');
  });
});
