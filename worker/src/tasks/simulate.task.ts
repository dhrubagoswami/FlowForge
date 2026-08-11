// simulate — deterministic test task used by the seed data and the demo panel. Sleeps for durationMs, then succeeds or throws a typed failure based on failureMode/failureRate.
import type { TaskInputFor } from '@flowforge/shared';
import type { TaskLogger } from '../lib/task-logger.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class SimulatedTaskError extends Error {
  readonly errorType: 'rate_limit' | 'timeout' | 'crash';

  constructor(errorType: 'rate_limit' | 'timeout' | 'crash', message: string) {
    super(message);
    this.name = 'SimulatedTaskError';
    this.errorType = errorType;
  }
}

export async function runSimulate(input: TaskInputFor<'simulate'>, log: TaskLogger): Promise<Record<string, unknown>> {
  await log('info', `simulating a ${input.durationMs}ms task`);
  await sleep(input.durationMs);

  const failureMode = input.failureMode ?? 'none';
  const failureRate = input.failureRate ?? 0;

  if (failureMode !== 'none' && Math.random() < failureRate) {
    const message = {
      rate_limit: 'upstream 429 Too Many Requests',
      timeout: 'context deadline exceeded',
      crash: 'unhandled exception in task handler',
    }[failureMode];
    await log('error', message);
    throw new SimulatedTaskError(failureMode, message);
  }

  await log('ok', `simulated task completed after ${input.durationMs}ms`);
  return { durationMs: input.durationMs };
}
