import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mockFetch, mockEnv, spyConsole } from '../_helpers/mocks.ts';
import { OPENAI_CHAT_RESPONSE, ANTHROPIC_MSG_RESPONSE } from '../_helpers/fixtures.ts';
import { callLLM } from '../../src/agents/callLLM.ts';
import { setVerbose } from '../../src/utils/logger.ts';

describe('callLLM', () => {
  let env: ReturnType<typeof mockEnv>;
  let consoleSpy: ReturnType<typeof spyConsole>;

  beforeEach(() => {
    consoleSpy = spyConsole();
    setVerbose(false);
  });

  afterEach(() => {
    consoleSpy.restore();
    setVerbose(false);
  });

  describe('OpenAI', () => {
    test('throws exact error when OPENAI_API_KEY not set', async () => {
      env = mockEnv({ OPENAI_API_KEY: undefined });
      try {
        await expect(
          callLLM({ provider: 'openai', systemPrompt: 'hi', userMessage: 'test' }),
        ).rejects.toThrow('OPENAI_API_KEY not set');
      } finally {
        env.restore();
      }
    });

    test('returns parsed response on success', async () => {
      env = mockEnv({ OPENAI_API_KEY: 'sk-test' });
      const fetchMock = mockFetch([{ status: 200, body: OPENAI_CHAT_RESPONSE }]);
      try {
        const res = await callLLM({ provider: 'openai', systemPrompt: 'sys', userMessage: 'msg' });
        expect(res.content).toBe('Hello world');
        expect(res.model).toBe('gpt-4o');
        expect(res.usage?.inputTokens).toBe(10);
        expect(res.usage?.outputTokens).toBe(5);
      } finally {
        fetchMock.restore();
        env.restore();
      }
    });

    test('error includes status and body', async () => {
      env = mockEnv({ OPENAI_API_KEY: 'sk-test' });
      const fetchMock = mockFetch([{ status: 401, body: 'Unauthorized' }]);
      try {
        await expect(
          callLLM({ provider: 'openai', systemPrompt: 'sys', userMessage: 'msg' }),
        ).rejects.toThrow(/OpenAI API error 401.*Unauthorized/);
      } finally {
        fetchMock.restore();
        env.restore();
      }
    });
  });

  describe('Anthropic', () => {
    test('throws exact error when ANTHROPIC_API_KEY not set', async () => {
      env = mockEnv({ ANTHROPIC_API_KEY: undefined });
      try {
        await expect(
          callLLM({ provider: 'anthropic', systemPrompt: 'hi', userMessage: 'test' }),
        ).rejects.toThrow('ANTHROPIC_API_KEY not set');
      } finally {
        env.restore();
      }
    });

    test('returns parsed response on success', async () => {
      env = mockEnv({ ANTHROPIC_API_KEY: 'sk-ant-test' });
      const fetchMock = mockFetch([{ status: 200, body: ANTHROPIC_MSG_RESPONSE }]);
      try {
        const res = await callLLM({ provider: 'anthropic', systemPrompt: 'sys', userMessage: 'msg' });
        expect(res.content).toBe('Hello world');
        expect(res.model).toBe('claude-sonnet-4-20250514');
        expect(res.usage?.inputTokens).toBe(10);
        expect(res.usage?.outputTokens).toBe(5);
      } finally {
        fetchMock.restore();
        env.restore();
      }
    });
  });

  describe('retry on 429', () => {
    test('retries on rate limit and warns user', async () => {
      env = mockEnv({ OPENAI_API_KEY: 'sk-test' });
      const fetchMock = mockFetch([
        { status: 429, body: 'Rate limited' },
        { status: 200, body: OPENAI_CHAT_RESPONSE },
      ]);
      try {
        const res = await callLLM({ provider: 'openai', systemPrompt: 'sys', userMessage: 'msg' });
        expect(res.content).toBe('Hello world');
        // Verify the rate limit warning was logged
        const logs = consoleSpy.logCalls();
        expect(logs.some((l) => l.includes('Rate limited, retrying in'))).toBe(true);
      } finally {
        fetchMock.restore();
        env.restore();
      }
    });

    test('throws after exhausting retries on persistent 429', async () => {
      env = mockEnv({ OPENAI_API_KEY: 'sk-test' });
      const fetchMock = mockFetch([
        { status: 429, body: 'Rate limited' },
        { status: 429, body: 'Rate limited' },
        { status: 429, body: 'Rate limited' },
      ]);
      try {
        await expect(
          callLLM({ provider: 'openai', systemPrompt: 'sys', userMessage: 'msg' }),
        ).rejects.toThrow(/OpenAI API error 429/);
      } finally {
        fetchMock.restore();
        env.restore();
      }
    }, 30_000);
  });

  describe('model defaults', () => {
    test('uses gpt-4o as default for openai', async () => {
      env = mockEnv({ OPENAI_API_KEY: 'sk-test' });
      const fetchMock = mockFetch([{ status: 200, body: OPENAI_CHAT_RESPONSE }]);
      try {
        await callLLM({ provider: 'openai', systemPrompt: 'sys', userMessage: 'msg' });
        const call = fetchMock.fn.mock.calls[0];
        const body = JSON.parse(call[1]?.body as string);
        expect(body.model).toBe('gpt-4o');
      } finally {
        fetchMock.restore();
        env.restore();
      }
    });

    test('uses specified model when provided', async () => {
      env = mockEnv({ OPENAI_API_KEY: 'sk-test' });
      const fetchMock = mockFetch([{ status: 200, body: OPENAI_CHAT_RESPONSE }]);
      try {
        await callLLM({ provider: 'openai', model: 'gpt-4-turbo', systemPrompt: 'sys', userMessage: 'msg' });
        const call = fetchMock.fn.mock.calls[0];
        const body = JSON.parse(call[1]?.body as string);
        expect(body.model).toBe('gpt-4-turbo');
      } finally {
        fetchMock.restore();
        env.restore();
      }
    });
  });
});
