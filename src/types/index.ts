export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface Scenario {
  name: string;
  description: string;
  issueKey?: string;
  precondition: string;
  steps: ScenarioStep[];
}

export interface ScenarioStep {
  number: number;
  action: string;
  selector?: string;
  expectedResult: string;
  notes?: string;
}

export interface TestResult {
  passed: boolean;
  exitCode: number;
  output: string;
  errorMessage?: string;
  tracePath?: string;
}

export interface SessionPaths {
  sessionName: string;
  sessionDir: string;
  codegenPath?: string;
  audioPath?: string;
  transcriptJsonPath?: string;
  transcriptMdPath?: string;
  scenarioPath?: string;
  testPath?: string;
  tracePath?: string;
  qaMdPath?: string;
}

export interface CLIOptions {
  key?: string;
  provider?: 'openai' | 'anthropic';
  model?: string;
  verbose?: boolean;
  voice?: boolean;
  trace?: boolean;
}
