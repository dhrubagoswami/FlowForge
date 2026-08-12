// §7.3.4: every HEARTBEAT_INTERVAL_MS, update this worker's last_heartbeat_at and inflight count.
// The read API derives "offline" from a stale heartbeat (worker.service.ts) — this file is the
// only thing responsible for keeping a live worker's heartbeat fresh.
import { eq } from 'drizzle-orm';
import type { WorkerSummary } from '@flowforge/shared';
import { INSTANCE_LOCK_REFRESH_INTERVAL_MS, workersTable } from '@flowforge/shared';
import { env } from './config/env.ts';
import { db } from './db/client.ts';
import { refreshInstanceLock } from './instance-lock.ts';
import { logger } from './lib/logger.ts';
import { publishRealtimeEvent } from './lib/realtime-publisher.ts';
import { toWorkerSummary } from './lib/worker-summary.util.ts';
import { withDbTimeout } from './lib/with-db-timeout.ts';

const HEARTBEAT_WRITE_TIMEOUT_MS = 5000;

// The Postgres write (last_heartbeat_at/inflight, on every HEARTBEAT_INTERVAL_MS tick) and the
// Redis PUBLISH that notifies connected browsers are deliberately on separate cadences. The DB
// write must stay on its full-frequency schedule — it's what worker.service.ts's staleness check
// reads to decide online/offline, so slowing it down would make that check less accurate. The
// PUBLISH, by contrast, exists purely to push a live UI update, and re-publishing an unchanged
// worker.updated payload every 5s (same status, same inflight count) was a real, avoidable Redis
// command-budget cost — one PUBLISH per tick, forever, regardless of whether anything a viewer
// would see actually changed. Now gated: publish immediately on any observable state change
// (status or inflight), otherwise at most once per HEARTBEAT_PUBLISH_MAX_INTERVAL_MS, so a fully
// idle worker still refreshes the UI periodically without publishing on every single tick.
const HEARTBEAT_PUBLISH_MAX_INTERVAL_MS = 30000;

function hasObservableChange(previous: WorkerSummary | null, next: WorkerSummary): boolean {
  if (!previous) return true;
  return previous.status !== next.status || previous.inflight !== next.inflight;
}

export class InflightCounter {
  private count = 0;

  increment(): void {
    this.count += 1;
  }

  decrement(): void {
    this.count = Math.max(0, this.count - 1);
  }

  get value(): number {
    return this.count;
  }
}

export function startHeartbeat(workerId: string, inflight: InflightCounter): { stop: () => void } {
  let lastPublished: WorkerSummary | null = null;
  let lastPublishedAt = 0;
  let lastLockRefreshAt = 0;

  const interval = setInterval(() => {
    logger.info({ workerId }, 'Heartbeat tick: starting DB write');

    const now0 = Date.now();
    if (now0 - lastLockRefreshAt >= INSTANCE_LOCK_REFRESH_INTERVAL_MS) {
      lastLockRefreshAt = now0;
      refreshInstanceLock()
        .then((stillHeld) => {
          if (!stillHeld) logger.error({ workerId }, 'Instance lock refresh found the lock no longer held by this process — another instance may have claimed this workerId');
        })
        .catch((err: unknown) => logger.error({ err, workerId }, 'Instance lock refresh failed — will retry next cycle'));
    }

    withDbTimeout(
      () =>
        db.update(workersTable)
          .set({ lastHeartbeatAt: new Date(), inflight: inflight.value, updatedAt: new Date() })
          .where(eq(workersTable.id, workerId))
          .returning(),
      HEARTBEAT_WRITE_TIMEOUT_MS,
      'heartbeat',
    )
      .then(([row]) => {
        logger.info({ workerId }, 'Heartbeat tick: DB write returned');
        if (!row) return;

        const summary = toWorkerSummary(row);
        const now = Date.now();
        const dueForPeriodicPublish = now - lastPublishedAt >= HEARTBEAT_PUBLISH_MAX_INTERVAL_MS;
        if (hasObservableChange(lastPublished, summary) || dueForPeriodicPublish) {
          publishRealtimeEvent({ event: 'worker.updated', data: { worker: summary } });
          lastPublished = summary;
          lastPublishedAt = now;
        }
      })
      .catch((err: unknown) => {
        // withDbTimeout already retried and logged every attempt — this is the final give-up. A
        // failed heartbeat write must never crash the worker or stop the interval, but it must not
        // fail silently either, since a heartbeat that's stopped landing looks identical (from the
        // read API's side) to a dead process, which is exactly the wrong thing to hide.
        logger.error({ err, workerId }, 'Heartbeat write failed after retries — will try again next tick');
      });
  }, env.HEARTBEAT_INTERVAL_MS);

  return { stop: () => clearInterval(interval) };
}
