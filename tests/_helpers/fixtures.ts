import type { ResolvedConfig } from '../../src/config/schema.ts';
import type { PipelineContext, PipelineStep, StepResult } from '../../src/pipeline/types.ts';

export function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
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
    ...overrides,
  } as ResolvedConfig;
}

export function makePipelineCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    sessionName: 'test-session',
    projectRoot: '/fake/root',
    appConfig: makeConfig(),
    paths: {} as any,
    config: {
      provider: 'openai',
      verbose: false,
      noVoice: true,
      noTrace: true,
      maxHealRetries: 1,
    },
    outputs: {},
    healAttempts: 0,
    ...overrides,
  };
}

export function makeStep(
  name: string,
  result: StepResult,
  opts?: { canSkip?: (ctx: PipelineContext) => boolean },
): PipelineStep {
  return {
    name,
    description: `Execute ${name}`,
    execute: async () => result,
    ...(opts?.canSkip ? { canSkip: opts.canSkip } : {}),
  };
}

export const AGENT_MD_FIXTURE = `---
model: "gpt-4o"
max_tokens: 8192
temperature: 0.3
agent: scenario-agent
---

# System Prompt

You are a test scenario generator.

## Input Schema

The user provides a transcript JSON.

## Output Schema

Return a YAML scenario.

## Rules

Be precise and avoid ambiguity.

## Example

\`\`\`yaml
name: Login flow
steps:
  - action: Navigate to /login
\`\`\`
`;

export const OPENAI_CHAT_RESPONSE = {
  id: 'chatcmpl-test',
  model: 'gpt-4o',
  choices: [{ message: { role: 'assistant', content: 'Hello world' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

export const ANTHROPIC_MSG_RESPONSE = {
  id: 'msg-test',
  model: 'claude-sonnet-4-20250514',
  content: [{ type: 'text', text: 'Hello world' }],
  usage: { input_tokens: 10, output_tokens: 5 },
};
