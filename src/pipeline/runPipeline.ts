import * as log from '../utils/logger.ts';
import type { PipelineContext, PipelineStep, PipelineResult, StepResult } from './types.ts';

export async function runPipeline(
  steps: PipelineStep[],
  ctx: PipelineContext,
  options?: { from?: string; skip?: string[] }
): Promise<PipelineResult> {
  const totalStart = Date.now();
  const results: PipelineResult['steps'] = [];
  const skipSet = new Set(options?.skip ?? []);
  let started = !options?.from;

  log.header(`Pipeline: ${ctx.sessionName}`);

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];

    if (!started) {
      if (s.name === options?.from) {
        started = true;
      } else {
        log.verbose(`Skipping ${s.name} (before --from)`);
        continue;
      }
    }

    if (skipSet.has(s.name)) {
      log.verbose(`Skipping ${s.name} (--skip)`);
      continue;
    }

    if (s.canSkip?.(ctx)) {
      log.verbose(`Skipping ${s.name} (canSkip returned true)`);
      continue;
    }

    log.step(i + 1, steps.length, s.name, s.description);
    const stepStart = Date.now();

    let result: StepResult;
    try {
      result = await s.execute(ctx);
    } catch (err) {
      result = { success: false, output: null, error: err instanceof Error ? err : new Error(String(err)) };
    }

    const durationMs = Date.now() - stepStart;
    results.push({ name: s.name, result, durationMs });

    if (result.success) {
      log.success(`${s.name} completed (${(durationMs / 1000).toFixed(1)}s)`);
    } else if (result.nonBlocking) {
      log.warn(`${s.name} failed (non-blocking): ${result.error?.message ?? 'unknown error'}`);
    } else {
      log.error(`${s.name} failed: ${result.error?.message ?? 'unknown error'}`);
      return {
        success: false,
        steps: results,
        totalDurationMs: Date.now() - totalStart,
      };
    }

    ctx.outputs[s.name] = result.output;
  }

  const totalDurationMs = Date.now() - totalStart;
  log.success(`Pipeline completed in ${(totalDurationMs / 1000).toFixed(1)}s`);

  return { success: true, steps: results, totalDurationMs };
}
