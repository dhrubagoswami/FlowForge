// Queries against idempotency_records. No business rules — the caller decides what a conflict means.
import { idempotencyTable } from '@flowforge/shared';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.ts';

/**
 * Attempts to claim an idempotency key via a single INSERT ... ON CONFLICT, never a read-then-write.
 * Returns true if this call won the claim, false if the key is already held by a DIFFERENT run
 * that hasn't expired yet. The guard exists to stop two different runs (e.g. two overlapping cron
 * fires) from both executing — it must never block the same run reclaiming its own key, whether
 * that's a BullMQ-driven retry or recovery after a stalled job gets handed to a new worker. Two
 * cases both count as a win: the existing row already belongs to this runId (same-run reclaim), or
 * the existing row has expired (genuinely available again).
 */
export async function tryClaimIdempotencyKey(params: { key: string; runId: string; ttlSeconds: number }): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + params.ttlSeconds * 1000);

  const result = await db
    .insert(idempotencyTable)
    .values({ key: params.key, runId: params.runId, expiresAt })
    .onConflictDoUpdate({
      target: idempotencyTable.key,
      set: { runId: params.runId, expiresAt },
      setWhere: sql`${idempotencyTable.runId} = ${params.runId} or ${idempotencyTable.expiresAt} < ${now.toISOString()}::timestamptz`,
    })
    .returning({ runId: idempotencyTable.runId });

  return result[0]?.runId === params.runId;
}
