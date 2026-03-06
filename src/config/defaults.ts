import type { E2eAiConfig } from './schema.ts';

export const DEFAULT_CONFIG: E2eAiConfig = {
  inputSource: 'none',
  outputTarget: 'markdown',
  keyPattern: null,
  baseUrl: null,
  paths: {
    tests: 'e2e/tests',
    scenarios: 'e2e/scenarios',
    recordings: 'e2e/recordings',
    transcripts: 'e2e/transcripts',
    traces: 'e2e/traces',
    workingDir: '.e2e-ai',
    qaOutput: 'qa',
  },
  voice: { enabled: true },
  llm: {
    provider: 'openai',
    model: null,
    agentModels: {},
  },
  playwright: {
    browser: 'chromium',
    timeout: 120_000,
    retries: 0,
    traceMode: 'on',
  },
  contextFile: 'e2e-ai.context.md',
  integrations: {
    jira: null,
    linear: null,
    zephyr: null,
  },
};
