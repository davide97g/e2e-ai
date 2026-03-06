import ora from 'ora';

export interface Spinner {
  start(text: string): void;
  update(text: string): void;
  succeed(text?: string): void;
  fail(text?: string): void;
  warn(text?: string): void;
  stop(): void;
}

function createNoopSpinner(): Spinner {
  return {
    start() {},
    update() {},
    succeed() {},
    fail() {},
    warn() {},
    stop() {},
  };
}

function createOraSpinner(): Spinner {
  let instance: ReturnType<typeof ora> | null = null;

  return {
    start(text: string) {
      instance = ora({ text, stream: process.stderr }).start();
    },
    update(text: string) {
      if (instance) {
        instance.text = text;
      }
    },
    succeed(text?: string) {
      if (instance) {
        instance.succeed(text);
        instance = null;
      }
    },
    fail(text?: string) {
      if (instance) {
        instance.fail(text);
        instance = null;
      }
    },
    warn(text?: string) {
      if (instance) {
        instance.warn(text);
        instance = null;
      }
    },
    stop() {
      if (instance) {
        instance.stop();
        instance = null;
      }
    },
  };
}

export function createSpinner(): Spinner {
  const isTTY = process.stderr.isTTY;
  const isCI = !!process.env.CI;

  if (!isTTY || isCI) {
    return createNoopSpinner();
  }

  return createOraSpinner();
}
