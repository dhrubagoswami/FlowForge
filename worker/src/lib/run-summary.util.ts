// Builds the same RunSummary shape the server's API returns, from a runs-table row plus its job's
// name — so run.started/run.finished SSE payloads match what the read API would show for that run.
import type { RunSummary } from '@flowforge/shared';
import type { runsTable } from '@flowforge/shared';

type RunRow = typeof runsTable.$inferSelect;

export function toRunSummary(run: RunRow, jobName: string): RunSummary {
  return {
    id: run.id,
    jobId: run.jobId,
    jobName,
    status: run.status,
    triggerSource: run.triggerSource,
    attempt: run.attempt,
    maxAttempts: run.maxAttempts,
    workerId: run.workerId,
    durationMs: run.durationMs,
    queuedAt: run.queuedAt.toISOString(),
    startedAt: run.startedAt ? run.startedAt.toISOString() : null,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
  };
}
