// §7.3.4: every HEARTBEAT_INTERVAL_MS, update this worker's last_heartbeat_at and inflight count.
// The read API derives "offline" from a stale heartbeat (worker.service.ts) — this file is the
// only thing responsible for keeping a live worker's heartbeat fresh.
import { eq } from 'drizzle-orm';
import { workersTable } from '@flowforge/shared';
import { env } from './config/env.ts';
import { db } from './db/client.ts';
import { logger } from './lib/logger.ts';
import { publishRealtimeEvent } from './lib/realtime-publisher.ts';
import { toWorkerSummary } from './lib/worker-summary.util.ts';

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
  const interval = setInterval(() => {
    logger.info({ workerId }, 'Heartbeat tick: starting DB write');
    db.update(workersTable)
      .set({ lastHeartbeatAt: new Date(), inflight: inflight.value, updatedAt: new Date() })
      .where(eq(workersTable.id, workerId))
      .returning()
      .then(([row]) => {
        logger.info({ workerId }, 'Heartbeat tick: DB write returned');
        if (row) publishRealtimeEvent({ event: 'worker.updated', data: { worker: toWorkerSummary(row) } });
      })
      .catch((err: unknown) => {
        // A failed heartbeat write must never crash the worker or stop the interval — but it must
        // not fail silently either, since a heartbeat that's stopped landing looks identical (from
        // the read API's side) to a dead process, which is exactly the wrong thing to hide.
        logger.error({ err, workerId }, 'Heartbeat write failed');
      });
  }, env.HEARTBEAT_INTERVAL_MS);

  return { stop: () => clearInterval(interval) };
}
