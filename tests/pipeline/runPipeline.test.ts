import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { spyConsole } from '../_helpers/mocks.ts';
import { makePipelineCtx, makeStep } from '../_helpers/fixtures.ts';
import { runPipeline } from '../../src/pipeline/runPipeline.ts';
import { setVerbose } from '../../src/utils/logger.ts';

describe('runPipeline', () => {
  let consoleSpy: ReturnType<typeof spyConsole>;

  beforeEach(() => {
    consoleSpy = spyConsole();
    setVerbose(false);
  });

  afterEach(() => {
    consoleSpy.restore();
    setVerbose(false);
  });

  test('runs all steps and returns success', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('step1', { success: true, output: 'out1' }),
      makeStep('step2', { success: true, output: 'out2' }),
    ];

    const result = await runPipeline(steps, ctx);
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(ctx.outputs['step1']).toBe('out1');
    expect(ctx.outputs['step2']).toBe('out2');
  });

  test('logs step progress format [current/total]', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('generate', { success: true, output: null }),
      makeStep('refine', { success: true, output: null }),
    ];

    await runPipeline(steps, ctx);
    const logs = consoleSpy.logCalls();
    expect(logs.some((l) => l.includes('[1/2]') && l.includes('generate'))).toBe(true);
    expect(logs.some((l) => l.includes('[2/2]') && l.includes('refine'))).toBe(true);
  });

  test('stops on blocking failure', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('step1', { success: false, output: null, error: new Error('boom') }),
      makeStep('step2', { success: true, output: 'unreachable' }),
    ];

    const result = await runPipeline(steps, ctx);
    expect(result.success).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(ctx.outputs['step2']).toBeUndefined();
  });

  test('continues on non-blocking failure', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('step1', { success: false, output: null, error: new Error('non-critical'), nonBlocking: true }),
      makeStep('step2', { success: true, output: 'reached' }),
    ];

    const result = await runPipeline(steps, ctx);
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(ctx.outputs['step2']).toBe('reached');
  });

  test('logs non-blocking failure as warning', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('step1', { success: false, output: null, error: new Error('soft fail'), nonBlocking: true }),
    ];

    await runPipeline(steps, ctx);
    const logs = consoleSpy.logCalls();
    expect(logs.some((l) => l.includes('failed (non-blocking)'))).toBe(true);
  });

  test('logs blocking failure as error to stderr', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('fail', { success: false, output: null, error: new Error('hard fail') }),
    ];

    await runPipeline(steps, ctx);
    const errors = consoleSpy.errorCalls();
    expect(errors.some((l) => l.includes('fail') && l.includes('hard fail'))).toBe(true);
  });

  test('--from skips steps before the specified name', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('record', { success: true, output: 'r' }),
      makeStep('transcribe', { success: true, output: 't' }),
      makeStep('generate', { success: true, output: 'g' }),
    ];

    const result = await runPipeline(steps, ctx, { from: 'transcribe' });
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(ctx.outputs['record']).toBeUndefined();
    expect(ctx.outputs['transcribe']).toBe('t');
    expect(ctx.outputs['generate']).toBe('g');
  });

  test('--skip removes specified steps', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('record', { success: true, output: 'r' }),
      makeStep('transcribe', { success: true, output: 't' }),
      makeStep('generate', { success: true, output: 'g' }),
    ];

    const result = await runPipeline(steps, ctx, { skip: ['transcribe'] });
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(ctx.outputs['record']).toBe('r');
    expect(ctx.outputs['transcribe']).toBeUndefined();
    expect(ctx.outputs['generate']).toBe('g');
  });

  test('--from and --skip can be combined', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('a', { success: true, output: 'a' }),
      makeStep('b', { success: true, output: 'b' }),
      makeStep('c', { success: true, output: 'c' }),
      makeStep('d', { success: true, output: 'd' }),
    ];

    const result = await runPipeline(steps, ctx, { from: 'b', skip: ['c'] });
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(2);
    expect(ctx.outputs['a']).toBeUndefined();
    expect(ctx.outputs['b']).toBe('b');
    expect(ctx.outputs['c']).toBeUndefined();
    expect(ctx.outputs['d']).toBe('d');
  });

  test('canSkip callback causes step to be skipped', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      makeStep('skip-me', { success: true, output: 'nope' }, { canSkip: () => true }),
      makeStep('run-me', { success: true, output: 'yes' }),
    ];

    const result = await runPipeline(steps, ctx);
    expect(result.success).toBe(true);
    expect(result.steps).toHaveLength(1);
    expect(ctx.outputs['skip-me']).toBeUndefined();
    expect(ctx.outputs['run-me']).toBe('yes');
  });

  test('catches exceptions thrown by execute', async () => {
    const ctx = makePipelineCtx();
    const steps = [
      {
        name: 'throws',
        description: 'Will throw',
        execute: async () => { throw new Error('unhandled'); },
      },
    ];

    const result = await runPipeline(steps, ctx);
    expect(result.success).toBe(false);
    expect(result.steps[0].result.error?.message).toBe('unhandled');
  });

  test('records step duration', async () => {
    const ctx = makePipelineCtx();
    const steps = [makeStep('fast', { success: true, output: null })];

    const result = await runPipeline(steps, ctx);
    expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });
});
