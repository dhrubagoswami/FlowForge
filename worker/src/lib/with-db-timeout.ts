// Wraps a DB-writing async function so a connection that stalls with no error and no rejection
// (the failure mode observed in DECISIONS.md's heartbeat-freeze investigation) fails loudly on a
// timeout instead of hanging forever, then retries with backoff before giving up.
import { logger } from './logger.ts';

const RETRY_DELAYS_MS = [1000, 3000];

function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    fn().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  const maxAttempts = RETRY_DELAYS_MS.length + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const startedAt = Date.now();
    try {
      return await withTimeout(fn, ms);
    } catch (err) {
      const elapsedMs = Date.now() - startedAt;
      logger.error({ err, label, elapsedMs, attempt, maxAttempts }, 'DB write timed out or failed');

      if (attempt === maxAttempts) throw err;

      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
  }

  throw new Error('unreachable');
}
