// Integration test against the real database — this repository's whole job is a specific SQL
// conflict behavior, which a mocked query builder can't meaningfully verify.
import { randomUUID } from 'node:crypto';
import { idempotencyTable } from '@flowforge/shared';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../db/client.ts';
import { tryClaimIdempotencyKey } from './idempotency.repository.ts';

const testKeys: string[] = [];

afterEach(async () => {
  for (const key of testKeys.splice(0)) {
    await db.delete(idempotencyTable).where(eq(idempotencyTable.key, key));
  }
});

describe('tryClaimIdempotencyKey', () => {
  it('wins the claim when the key does not exist yet', async () => {
    const key = `test:${randomUUID()}`;
    testKeys.push(key);

    const won = await tryClaimIdempotencyKey({ key, runId: randomUUID(), ttlSeconds: 3600 });
    expect(won).toBe(true);
  });

  it('loses the claim when the key is already held by an unexpired run', async () => {
    const key = `test:${randomUUID()}`;
    testKeys.push(key);
    const firstRunId = randomUUID();

    const firstClaim = await tryClaimIdempotencyKey({ key, runId: firstRunId, ttlSeconds: 3600 });
    const secondClaim = await tryClaimIdempotencyKey({ key, runId: randomUUID(), ttlSeconds: 3600 });

    expect(firstClaim).toBe(true);
    expect(secondClaim).toBe(false);

    const [row] = await db.select().from(idempotencyTable).where(eq(idempotencyTable.key, key));
    expect(row?.runId).toBe(firstRunId); // the loser's write never landed
  });

  it('wins the claim when the existing key has already expired', async () => {
    const key = `test:${randomUUID()}`;
    testKeys.push(key);

    await tryClaimIdempotencyKey({ key, runId: randomUUID(), ttlSeconds: -1 }); // expires immediately (in the past)
    const secondRunId = randomUUID();
    const reclaimed = await tryClaimIdempotencyKey({ key, runId: secondRunId, ttlSeconds: 3600 });

    expect(reclaimed).toBe(true);
    const [row] = await db.select().from(idempotencyTable).where(eq(idempotencyTable.key, key));
    expect(row?.runId).toBe(secondRunId);
  });

  it('wins a second claim by the SAME run even while its key is still unexpired — a stalled-job recovery or BullMQ retry reclaiming its own key, not a duplicate', async () => {
    const key = `test:${randomUUID()}`;
    testKeys.push(key);
    const runId = randomUUID();

    const firstClaim = await tryClaimIdempotencyKey({ key, runId, ttlSeconds: 3600 });
    const secondClaim = await tryClaimIdempotencyKey({ key, runId, ttlSeconds: 3600 }); // same runId, key still unexpired

    expect(firstClaim).toBe(true);
    expect(secondClaim).toBe(true);
  });
});
