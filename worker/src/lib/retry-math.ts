// Pure retry-accounting math, isolated from worker.ts so it can be unit tested without BullMQ or a database.
import type { RetryBackoff } from '@flowforge/shared';

/**
 * BullMQ increments job.attemptsMade only after the processor returns or throws, so during
 * processing it holds the count from before this attempt: 0 on the first call, 1 on the second.
 * currentAttempt is the human "attempt N of Y" number for the attempt in progress.
 */
export function attemptInfo(attemptsMade: number, maxAttempts: number): { currentAttempt: number; isFinalAttempt: boolean } {
  const currentAttempt = attemptsMade + 1;
  return { currentAttempt, isFinalAttempt: currentAttempt >= maxAttempts };
}

/**
 * The delay before the NEXT attempt, mirroring BullMQ's own exponential-backoff strategy exactly
 * (Backoffs.builtinStrategies.exponential: Math.round(2^(attemptsMade-1) * delay), called with
 * attemptsMade = currentAttempt) so the log line we write matches what BullMQ will actually do.
 */
export function nextRetryDelayMs(backoff: RetryBackoff, baseMs: number, currentAttempt: number): number {
  return backoff === 'exponential' ? Math.round(2 ** (currentAttempt - 1) * baseMs) : baseMs;
}
