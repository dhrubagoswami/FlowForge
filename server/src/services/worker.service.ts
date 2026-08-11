// Business rules for workers: derives "offline" from a stale heartbeat on read, never stored.
import type { WorkerSummary } from '@flowforge/shared';
import { WORKER_OFFLINE_AFTER_SECONDS } from '../config/constants.ts';
import { findAllWorkers, type WorkerRow } from '../repositories/worker.repository.ts';

function toWorkerSummary(worker: WorkerRow, now: Date): WorkerSummary {
  const secondsSinceHeartbeat = (now.getTime() - worker.lastHeartbeatAt.getTime()) / 1000;
  const status = secondsSinceHeartbeat > WORKER_OFFLINE_AFTER_SECONDS ? 'offline' : worker.status;

  return {
    id: worker.id,
    hostname: worker.hostname,
    status,
    concurrency: worker.concurrency,
    inflight: worker.inflight,
    lastHeartbeatAt: worker.lastHeartbeatAt.toISOString(),
  };
}

export async function listWorkers(): Promise<WorkerSummary[]> {
  const workers = await findAllWorkers();
  const now = new Date();
  return workers.map((w) => toWorkerSummary(w, now));
}
