// Worker identity: picks a worker-NN id if none was configured, upserts this process's workers
// row on boot, and marks it offline on shutdown. Heartbeating and draining live in heartbeat.ts
// and shutdown.ts — this file only owns "who am I" and "I exist in the workers table".
import { eq, sql } from 'drizzle-orm';
import { workersTable } from '@flowforge/shared';
import { env } from './config/env.ts';
import { db } from './db/client.ts';
import { publishRealtimeEvent } from './lib/realtime-publisher.ts';
import { toWorkerSummary } from './lib/worker-summary.util.ts';

const WORKER_ID_PATTERN = /^worker-(\d{2})$/;

/** Pure: given existing worker-NN ids, finds the lowest unused two-digit suffix. Exported for direct testing. */
export function lowestUnusedWorkerNumber(existingIds: string[]): number {
  const usedNumbers = new Set(existingIds.map((id) => WORKER_ID_PATTERN.exec(id)?.[1]).filter((n): n is string => n !== undefined).map(Number));

  let n = 1;
  while (usedNumbers.has(n)) n += 1;
  return n;
}

/** Finds the lowest unused two-digit suffix for the worker-NN pattern (seed data already occupies 01-08). Deterministic — no random-id collision risk. */
async function nextUnusedWorkerId(): Promise<string> {
  const rows = await db.select({ id: workersTable.id }).from(workersTable).where(sql`${workersTable.id} ~ '^worker-[0-9]{2}$'`);
  const n = lowestUnusedWorkerNumber(rows.map((r) => r.id));
  return `worker-${String(n).padStart(2, '0')}`;
}

export async function resolveWorkerId(): Promise<string> {
  if (env.WORKER_ID) return env.WORKER_ID;
  return nextUnusedWorkerId();
}

export async function registerWorker(workerId: string): Promise<void> {
  const now = new Date();
  const [row] = await db
    .insert(workersTable)
    .values({
      id: workerId,
      hostname: process.env.HOSTNAME ?? workerId,
      status: 'online',
      concurrency: env.WORKER_CONCURRENCY,
      inflight: 0,
      lastHeartbeatAt: now,
      startedAt: now,
      version: '0.1.0',
    })
    .onConflictDoUpdate({
      target: workersTable.id,
      set: { status: 'online', concurrency: env.WORKER_CONCURRENCY, lastHeartbeatAt: now, startedAt: now, updatedAt: now },
    })
    .returning();
  if (row) publishRealtimeEvent({ event: 'worker.updated', data: { worker: toWorkerSummary(row) } });
}

export async function markWorkerOffline(workerId: string): Promise<void> {
  const [row] = await db.update(workersTable).set({ status: 'offline', updatedAt: new Date() }).where(eq(workersTable.id, workerId)).returning();
  if (row) publishRealtimeEvent({ event: 'worker.updated', data: { worker: toWorkerSummary(row) } });
}
