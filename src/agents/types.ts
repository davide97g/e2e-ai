export interface AgentConfig {
  model?: string;
  maxTokens: number;
  temperature: number;
}

export interface AgentPrompt {
  name: string;
  systemPrompt: string;
  inputSchema?: string;
  outputSchema?: string;
  rules?: string;
  example?: string;
  config: AgentConfig;
}

export interface LLMRequest {
  provider: 'openai' | 'anthropic';
  model?: string;
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: { inputTokens: number; outputTokens: number };
}
