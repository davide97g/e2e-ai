import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spyConsole } from '../_helpers/mocks.ts';
import { info, success, warn, error, step, verbose, setVerbose, header } from '../../src/utils/logger.ts';

describe('logger', () => {
  let spy: ReturnType<typeof spyConsole>;

  beforeEach(() => {
    spy = spyConsole();
    setVerbose(false);
  });

  afterEach(() => {
    spy.restore();
    setVerbose(false);
  });

  test('info writes to stdout', () => {
    info('test message');
    expect(spy.log).toHaveBeenCalledTimes(1);
    expect(spy.error).not.toHaveBeenCalled();
  });

  test('success writes to stdout', () => {
    success('done');
    expect(spy.log).toHaveBeenCalledTimes(1);
    expect(spy.error).not.toHaveBeenCalled();
  });

  test('warn writes to stdout', () => {
    warn('careful');
    expect(spy.log).toHaveBeenCalledTimes(1);
    expect(spy.error).not.toHaveBeenCalled();
  });

  test('error writes to stderr', () => {
    error('failed');
    expect(spy.error).toHaveBeenCalledTimes(1);
    expect(spy.log).not.toHaveBeenCalled();
  });

  test('step formats as [current/total] name: description', () => {
    step(3, 8, 'generate', 'Generating test code');
    const output = spy.logCalls()[0];
    expect(output).toContain('[3/8]');
    expect(output).toContain('generate');
    expect(output).toContain('Generating test code');
  });

  test('verbose is silent when disabled', () => {
    verbose('debug info');
    expect(spy.log).not.toHaveBeenCalled();
  });

  test('verbose writes when enabled', () => {
    setVerbose(true);
    verbose('debug info');
    expect(spy.log).toHaveBeenCalledTimes(1);
  });

  test('header writes title with separator', () => {
    header('Pipeline');
    expect(spy.log).toHaveBeenCalledTimes(2);
    const calls = spy.logCalls();
    expect(calls[0]).toContain('Pipeline');
    expect(calls[1]).toContain('─');
  });
});
