import type { TestResult } from '../types/index.ts';
import type { ResolvedConfig } from '../config/schema.ts';
import type { ResolvedPaths } from '../config/paths.ts';

export interface PipelineContext {
  sessionName: string;
  key?: string;
  projectRoot: string;
  appConfig: ResolvedConfig;
  paths: ResolvedPaths;
  config: {
    provider: 'openai' | 'anthropic';
    model?: string;
    verbose: boolean;
    noVoice: boolean;
    noTrace: boolean;
    maxHealRetries: number;
  };
  codegenPath?: string;
  audioPath?: string;
  transcriptPath?: string;
  scenarioPath?: string;
  testPath?: string;
  tracePath?: string;
  outputs: Record<string, unknown>;
  testResult?: TestResult;
  healAttempts: number;
}

export interface PipelineStep {
  name: string;
  description: string;
  execute(ctx: PipelineContext): Promise<StepResult>;
  canSkip?(ctx: PipelineContext): boolean;
}

export interface StepResult {
  success: boolean;
  output: unknown;
  error?: Error;
  nonBlocking?: boolean;
}

export interface PipelineResult {
  success: boolean;
  steps: Array<{ name: string; result: StepResult; durationMs: number }>;
  totalDurationMs: number;
}
