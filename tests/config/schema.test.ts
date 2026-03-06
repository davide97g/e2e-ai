import { describe, test, expect } from 'bun:test';
import { E2eAiConfigSchema, defineConfig } from '../../src/config/schema.ts';

describe('E2eAiConfigSchema', () => {
  test('applies all defaults from empty object', () => {
    const result = E2eAiConfigSchema.parse({});
    expect(result.inputSource).toBe('none');
    expect(result.outputTarget).toBe('markdown');
    expect(result.keyPattern).toBeNull();
    expect(result.baseUrl).toBeNull();
    expect(result.contextFile).toBe('e2e-ai.context.md');
  });

  test('nested paths defaults apply when paths is omitted', () => {
    const result = E2eAiConfigSchema.parse({});
    expect(result.paths.tests).toBe('e2e/tests');
    expect(result.paths.scenarios).toBe('e2e/scenarios');
    expect(result.paths.recordings).toBe('e2e/recordings');
    expect(result.paths.workingDir).toBe('.e2e-ai');
    expect(result.paths.qaOutput).toBe('qa');
  });

  test('nested llm defaults apply when llm is omitted', () => {
    const result = E2eAiConfigSchema.parse({});
    expect(result.llm.provider).toBe('openai');
    expect(result.llm.model).toBeNull();
    expect(result.llm.agentModels).toEqual({});
  });

  test('nested playwright defaults apply when playwright is omitted', () => {
    const result = E2eAiConfigSchema.parse({});
    expect(result.playwright.browser).toBe('chromium');
    expect(result.playwright.timeout).toBe(120_000);
    expect(result.playwright.retries).toBe(0);
  });

  test('nested voice defaults apply when voice is omitted', () => {
    const result = E2eAiConfigSchema.parse({});
    expect(result.voice.enabled).toBe(true);
  });

  test('nested integrations defaults apply when integrations is omitted', () => {
    const result = E2eAiConfigSchema.parse({});
    expect(result.integrations.jira).toBeNull();
    expect(result.integrations.linear).toBeNull();
    expect(result.integrations.zephyr).toBeNull();
  });

  test('user overrides merge with defaults', () => {
    const result = E2eAiConfigSchema.parse({
      inputSource: 'jira',
      paths: { tests: 'custom/tests' },
      llm: { provider: 'anthropic' },
    });
    expect(result.inputSource).toBe('jira');
    expect(result.paths.tests).toBe('custom/tests');
    expect(result.paths.scenarios).toBe('e2e/scenarios'); // still default
    expect(result.llm.provider).toBe('anthropic');
    expect(result.llm.model).toBeNull(); // still default
  });

  test('invalid inputSource produces validation error', () => {
    expect(() => E2eAiConfigSchema.parse({ inputSource: 'gitlab' })).toThrow();
  });

  test('invalid outputTarget produces validation error', () => {
    expect(() => E2eAiConfigSchema.parse({ outputTarget: 'pdf' })).toThrow();
  });

  test('nested null is treated as empty object (defaults applied)', () => {
    const result = E2eAiConfigSchema.parse({ paths: null });
    expect(result.paths.tests).toBe('e2e/tests');
  });

  test('nested undefined is treated as empty object (defaults applied)', () => {
    const result = E2eAiConfigSchema.parse({ paths: undefined });
    expect(result.paths.tests).toBe('e2e/tests');
  });
});

describe('defineConfig', () => {
  test('returns the config object unchanged (type helper)', () => {
    const cfg = { inputSource: 'jira' as const };
    expect(defineConfig(cfg)).toBe(cfg);
  });
});
