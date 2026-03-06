import * as log from '../utils/logger.ts';
import type { LLMRequest, LLMResponse } from './types.ts';

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
};

const MAX_RETRIES = 2;

export async function callLLM(request: LLMRequest): Promise<LLMResponse> {
  const model = request.model ?? DEFAULT_MODELS[request.provider];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (request.provider === 'openai') {
        return await callOpenAI({ ...request, model });
      }
      return await callAnthropic({ ...request, model });
    } catch (err: any) {
      const isRateLimit = err?.status === 429;
      if (isRateLimit && attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        log.warn(`Rate limited, retrying in ${delay / 1000}s...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw new Error('Unreachable');
}

async function callOpenAI(request: LLMRequest & { model: string }): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');

  log.verbose(`Calling OpenAI ${request.model}...`);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: request.model,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userMessage },
      ],
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.2,
      ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const err: any = new Error(`OpenAI API error ${response.status}: ${body}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  return {
    content: choice?.message?.content ?? '',
    model: data.model,
    usage: data.usage
      ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
      : undefined,
  };
}

async function callAnthropic(request: LLMRequest & { model: string }): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  log.verbose(`Calling Anthropic ${request.model}...`);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: request.model,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userMessage }],
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature ?? 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    const err: any = new Error(`Anthropic API error ${response.status}: ${body}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const textBlock = data.content?.find((b: any) => b.type === 'text');

  return {
    content: textBlock?.text ?? '',
    model: data.model,
    usage: data.usage
      ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens }
      : undefined,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
