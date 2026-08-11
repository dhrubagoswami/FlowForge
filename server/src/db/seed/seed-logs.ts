// Generates realistic per-run log lines, styled after web/src/data/mockData.ts's LOG_POOL, keyed by outcome and failure mode.
import type { FailureMode, LogLevel, RunStatus } from '@flowforge/shared';

export interface SeedLogLine {
  offsetMs: number;
  level: LogLevel;
  message: string;
}

function idempotencyLine(jobId: string, scheduledAtIso: string): SeedLogLine {
  return { offsetMs: 5, level: 'info', message: `lock acquired · idempotency key ${jobId}:${scheduledAtIso}` };
}

export function failureMessage(mode: FailureMode, attempt: number, maxAttempts: number): { message: string; errorType: string } {
  switch (mode) {
    case 'rate_limit':
      return { message: `upstream 429 Too Many Requests · attempt ${attempt}/${maxAttempts}`, errorType: 'rate_limit' };
    case 'timeout':
      return { message: `context deadline exceeded · attempt ${attempt}/${maxAttempts}`, errorType: 'timeout' };
    case 'crash':
      return { message: `unhandled exception in task handler · attempt ${attempt}/${maxAttempts}`, errorType: 'crash' };
    case 'none':
      return { message: `unexpected failure · attempt ${attempt}/${maxAttempts}`, errorType: 'unknown' };
  }
}

export function buildRunLogs(params: {
  jobId: string;
  jobName: string;
  workerId: string;
  scheduledAtIso: string;
  attempt: number;
  maxAttempts: number;
  durationMs: number;
  outcome: RunStatus;
  failureMode: FailureMode;
  runIdShort: string;
}): SeedLogLine[] {
  const { jobId, jobName, workerId, scheduledAtIso, attempt, maxAttempts, durationMs, outcome, failureMode, runIdShort } = params;

  if (outcome === 'skipped_duplicate') {
    return [{ offsetMs: 0, level: 'warn', message: `duplicate delivery detected · idempotency hit, skipped · ${jobName}` }];
  }

  const lines: SeedLogLine[] = [
    { offsetMs: 0, level: 'info', message: `${workerId} claimed job ${jobId}#${runIdShort} (attempt ${attempt}/${maxAttempts})` },
    idempotencyLine(jobId, scheduledAtIso),
  ];

  if (outcome === 'succeeded') {
    lines.push({ offsetMs: Math.round(durationMs * 0.6), level: 'ok', message: `run ${runIdShort} completed in ${(durationMs / 1000).toFixed(1)}s` });
    return lines;
  }

  const { message, errorType } = failureMessage(failureMode, attempt, maxAttempts);
  lines.push({ offsetMs: Math.round(durationMs * 0.8), level: 'error', message: `${message} (${errorType})` });

  if (outcome === 'retrying') {
    lines.push({ offsetMs: durationMs, level: 'info', message: `requeued with backoff · attempt ${attempt + 1}/${maxAttempts}` });
  }

  if (outcome === 'dead_letter') {
    lines.push({ offsetMs: durationMs, level: 'error', message: `attempt ${attempt}/${maxAttempts} failed · dead-lettered` });
  }

  return lines;
}
