// Builds the same WorkerSummary shape the server's API returns, from a workers-table row.
import type { WorkerSummary } from '@flowforge/shared';
import type { workersTable } from '@flowforge/shared';

type WorkerRow = typeof workersTable.$inferSelect;

export function toWorkerSummary(worker: WorkerRow): WorkerSummary {
  return {
    id: worker.id,
    hostname: worker.hostname,
    status: worker.status,
    concurrency: worker.concurrency,
    inflight: worker.inflight,
    lastHeartbeatAt: worker.lastHeartbeatAt.toISOString(),
  };
}
