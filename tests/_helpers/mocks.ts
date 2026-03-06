import { spyOn, mock, type Mock } from 'bun:test';

export function spyConsole() {
  const log = spyOn(console, 'log').mockImplementation(() => {});
  const error = spyOn(console, 'error').mockImplementation(() => {});
  return {
    log,
    error,
    logCalls: () => log.mock.calls.map((c) => c.map(String).join(' ')),
    errorCalls: () => error.mock.calls.map((c) => c.map(String).join(' ')),
    restore() {
      log.mockRestore();
      error.mockRestore();
    },
  };
}

export function mockFetch(responses: Array<{ status: number; body: string | object }>) {
  let callIndex = 0;
  const fn = mock(async () => {
    const r = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }) as Mock<typeof globalThis.fetch>;
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  return {
    fn,
    restore() {
      globalThis.fetch = original;
    },
  };
}

export function mockEnv(overrides: Record<string, string | undefined>) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  return {
    restore() {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = v;
        }
      }
    },
  };
}
