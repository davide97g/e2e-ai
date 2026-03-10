import type { QAMapV2Payload, PushResult } from './types.ts';

export async function pushToApi(
  payload: QAMapV2Payload,
  apiUrl: string,
  apiKey: string,
): Promise<PushResult> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Push failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<PushResult>;
}
