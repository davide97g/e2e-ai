import { z } from 'zod';

/** Helper: make a nested object schema that applies inner defaults even when the parent is omitted. */
function nested<T extends z.ZodRawShape>(shape: T) {
  const inner = z.object(shape);
  return z.preprocess((val) => val ?? {}, inner);
}

const PathsSchema = z.object({
  tests: z.string().default('e2e/tests'),
  scenarios: z.string().default('e2e/scenarios'),
  recordings: z.string().default('e2e/recordings'),
  transcripts: z.string().default('e2e/transcripts'),
  traces: z.string().default('e2e/traces'),
  workingDir: z.string().default('.e2e-ai'),
  qaOutput: z.string().default('qa'),
});

const VoiceSchema = z.object({
  enabled: z.boolean().default(true),
});

const LlmSchema = z.object({
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  model: z.string().nullable().default(null),
  agentModels: z.record(z.string(), z.string()).default({}),
});

const PlaywrightSchema = z.object({
  browser: z.string().default('chromium'),
  timeout: z.number().default(120_000),
  retries: z.number().default(0),
  traceMode: z.string().default('on'),
});

const ZephyrSchema = z.object({
  titlePrefix: z.string().default('UI Automation'),
});

const IntegrationsSchema = z.object({
  jira: z.object({}).nullable().default(null),
  linear: z.object({}).nullable().default(null),
  zephyr: ZephyrSchema.nullable().default(null),
});

export const E2eAiConfigSchema = z.object({
  inputSource: z.enum(['jira', 'linear', 'none']).default('none'),
  outputTarget: z.enum(['zephyr', 'markdown', 'both']).default('markdown'),
  keyPattern: z.string().nullable().default(null),
  baseUrl: z.string().nullable().default(null),
  paths: nested(PathsSchema.shape),
  voice: nested(VoiceSchema.shape),
  llm: nested(LlmSchema.shape),
  playwright: nested(PlaywrightSchema.shape),
  contextFile: z.string().default('e2e-ai.context.md'),
  integrations: nested(IntegrationsSchema.shape),
});

export type E2eAiConfig = z.input<typeof E2eAiConfigSchema>;
export type ResolvedConfig = z.output<typeof E2eAiConfigSchema>;

export function defineConfig(config: E2eAiConfig): E2eAiConfig {
  return config;
}
