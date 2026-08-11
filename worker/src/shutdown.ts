// §7.3.5: on SIGTERM/SIGINT, mark this worker draining, stop accepting new tasks, wait up to
// SHUTDOWN_GRACE_MS for in-flight tasks to finish, then mark offline and exit. If a task is still
// running when the grace period expires, BullMQ's own stalled-job recovery (lock renewal timing
// out once this process is gone) returns it to the queue for another worker to pick up — this
// file doesn't need to do anything special for that case beyond simply not waiting forever.
import { eq } from 'drizzle-orm';
import type { Worker } from 'bullmq';
import { workersTable } from '@flowforge/shared';
import { env } from './config/env.ts';
import { db } from './db/client.ts';
import { logger } from './lib/logger.ts';
import { publishRealtimeEvent } from './lib/realtime-publisher.ts';
import { toWorkerSummary } from './lib/worker-summary.util.ts';
import { markWorkerOffline } from './registration.ts';

async function markDraining(workerId: string): Promise<void> {
  const [row] = await db.update(workersTable).set({ status: 'draining', updatedAt: new Date() }).where(eq(workersTable.id, workerId)).returning();
  if (row) publishRealtimeEvent({ event: 'worker.updated', data: { worker: toWorkerSummary(row) } });
}

export function registerShutdownHandlers(params: { workerId: string; worker: Worker; stopHeartbeat: () => void }): void {
  const { workerId, worker, stopHeartbeat } = params;
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`Received ${signal}, draining worker "${workerId}" (up to ${(env.SHUTDOWN_GRACE_MS / 1000).toFixed(0)}s for in-flight work)...`);
    await markDraining(workerId);

    // worker.close() stops the worker from claiming new jobs immediately, then waits for
    // in-flight processor calls to settle — but we cap that wait ourselves so a stuck task can't
    // hold the process open past the grace period. If it times out, we exit anyway; the job's
    // lock will lapse and BullMQ hands it to another worker.
    const closed = worker.close();
    const timedOut = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), env.SHUTDOWN_GRACE_MS));
    const result = await Promise.race([closed.then(() => 'closed' as const), timedOut]);

    if (result === 'timeout') {
      logger.info(`Worker "${workerId}" hit its shutdown grace period with work still in flight — exiting anyway.`);
    } else {
      logger.info(`Worker "${workerId}" drained cleanly.`);
    }

    stopHeartbeat();
    await markWorkerOffline(workerId);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}
