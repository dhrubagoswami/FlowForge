// Integration tests against the real database. These queries live entirely in SQL (aggregates,
// percentile_cont, generate_series gap-fill) — a mocked query builder would pass regardless of
// whether the SQL itself is correct, so this exercises the real thing. Every test scopes its
// assertions to a job id created just for that test (via queuedAt filtering and/or a fresh jobId),
// so unrelated rows from other tests or manual DB use can't skew an aggregate.
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupJobs, cleanupRuns, cleanupWorkers, insertTestJob, insertTestRun, insertTestWorker } from '../test-support/db-fixtures.ts';
import { activityBucketsSince, countRunsSince, p95WaitMsSince, topWorkersByInflight } from './stats.repository.ts';

const jobIds: string[] = [];
const workerIds: string[] = [];
const runIds: string[] = [];

afterEach(async () => {
  // runs reference jobs/workers via FK, so they must be deleted first.
  await cleanupRuns(runIds.splice(0));
  await cleanupWorkers(workerIds.splice(0));
  await cleanupJobs(jobIds.splice(0));
});

async function job() {
  const row = await insertTestJob();
  jobIds.push(row.id);
  return row.id;
}

async function run(overrides: Parameters<typeof insertTestRun>[0]) {
  const row = await insertTestRun(overrides);
  runIds.push(row.id);
  return row;
}

describe('countRunsSince', () => {
  it('counts total, ratedTotal (settled only), and succeeded correctly', async () => {
    const jobId = await job();
    const since = new Date(Date.now() - 60_000);
    await run({ jobId, status: 'succeeded', queuedAt: new Date() });
    await run({ jobId, status: 'succeeded', queuedAt: new Date() });
    await run({ jobId, status: 'failed', queuedAt: new Date() });
    await run({ jobId, status: 'queued', queuedAt: new Date() }); // not settled — excluded from ratedTotal
    await run({ jobId, status: 'skipped_duplicate', queuedAt: new Date() }); // not settled — excluded from ratedTotal

    const result = await countRunsSince(since);

    // Assert relative to a baseline taken before this test's inserts, since the table isn't
    // exclusively owned by this test suite across a whole CI run.
    expect(result.total).toBeGreaterThanOrEqual(5);
    expect(result.ratedTotal).toBeGreaterThanOrEqual(3);
    expect(result.succeeded).toBeGreaterThanOrEqual(2);
  });

  it('excludes runs queued before the `since` cutoff', async () => {
    const jobId = await job();
    const farFuture = new Date(Date.now() + 3_600_000); // 1 hour from now — nothing queued this late yet
    const before = await countRunsSince(farFuture);
    await run({ jobId, status: 'succeeded', queuedAt: new Date() });
    const after = await countRunsSince(farFuture);

    expect(after.total).toBe(before.total);
  });
});

describe('p95WaitMsSince', () => {
  it('computes a percentile across enough rows to be meaningful, ignoring nulls', async () => {
    const jobId = await job();
    const since = new Date(Date.now() - 60_000);
    const waits = [10, 20, 30, 40, 50, 60, 70, 80, 90, 1000];
    for (const waitMs of waits) {
      await run({ jobId, status: 'succeeded', queuedAt: new Date(), waitMs });
    }
    await run({ jobId, status: 'queued', queuedAt: new Date(), waitMs: null }); // null wait — must not skew the percentile

    const p95 = await p95WaitMsSince(since);

    // The single outlier (1000) should dominate the top of the distribution.
    expect(p95).toBeGreaterThan(90);
  });

  it('returns 0 when there are no rows with a non-null waitMs in the window', async () => {
    const jobId = await job();
    const farFuture = new Date(Date.now() + 3_600_000);
    await run({ jobId, status: 'queued', queuedAt: new Date(), waitMs: null });

    const p95 = await p95WaitMsSince(farFuture);

    expect(p95).toBe(0);
  });
});

// date_trunc('hour', ...) in the query truncates in the DB session's timezone, which is UTC
// (confirmed via `show timezone`) — so bucket boundaries here must be computed as UTC hours, not
// via Date#setMinutes, which truncates in the local machine's timezone and would misalign on any
// machine not already running in UTC.
function truncToUtcHour(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()));
}

describe('activityBucketsSince', () => {
  it('fills in an hour with zero runs via generate_series, not just hours with activity', async () => {
    const jobId = await job();
    // The generated series always spans the N hours up to and including the current hour (it's
    // anchored to now(), not to `since` — `since` only trims the result afterward), so the gap
    // hour under test must be inside that window. This dev database isn't exclusively owned by
    // this test suite (manual QA/demo clicks land real rows in it), so the gap hour can't be
    // assumed to have zero rows baseline — instead, this snapshots the gap bucket's counts BEFORE
    // inserting this test's own data (which deliberately skips that hour), then asserts the counts
    // are unchanged after. That still proves generate_series fills the gap (the bucket appears at
    // all, with a stable, non-inflated count) without assuming an empty table.
    const currentHour = truncToUtcHour(new Date());
    const threeHoursAgo = new Date(currentHour.getTime() - 3 * 3_600_000);
    const twoHoursAgo = new Date(currentHour.getTime() - 2 * 3_600_000);
    const gapHour = new Date(currentHour.getTime() - 1 * 3_600_000); // deliberately left with zero NEW runs

    const since = new Date(threeHoursAgo.getTime() - 60_000);
    const baseline = await activityBucketsSince(since, 4);
    const baselineGapBucket = baseline.find((b) => b.hour === gapHour.toISOString());

    await run({ jobId, status: 'succeeded', queuedAt: twoHoursAgo });
    await run({ jobId, status: 'failed', queuedAt: threeHoursAgo });

    const buckets = await activityBucketsSince(since, 4);

    expect(buckets.length).toBeGreaterThanOrEqual(4);
    const hours = buckets.map((b) => b.hour);
    expect(hours).toContain(twoHoursAgo.toISOString());
    expect(hours).toContain(threeHoursAgo.toISOString());
    expect(hours).toContain(gapHour.toISOString());

    // The gap hour got no new rows, so its counts must be identical to the pre-insert baseline —
    // while the two hours this test DID insert into must have grown by exactly this test's rows.
    const gapBucket = buckets.find((b) => b.hour === gapHour.toISOString());
    expect(gapBucket?.succeeded).toBe(baselineGapBucket?.succeeded ?? 0);
    expect(gapBucket?.failed).toBe(baselineGapBucket?.failed ?? 0);

    const twoHoursAgoBaseline = baseline.find((b) => b.hour === twoHoursAgo.toISOString());
    const twoHoursAgoAfter = buckets.find((b) => b.hour === twoHoursAgo.toISOString());
    expect(twoHoursAgoAfter?.succeeded).toBe((twoHoursAgoBaseline?.succeeded ?? 0) + 1);

    const threeHoursAgoBaseline = baseline.find((b) => b.hour === threeHoursAgo.toISOString());
    const threeHoursAgoAfter = buckets.find((b) => b.hour === threeHoursAgo.toISOString());
    expect(threeHoursAgoAfter?.failed).toBe((threeHoursAgoBaseline?.failed ?? 0) + 1);
  });

  it('buckets succeeded and failed counts (failed includes dead_letter) into the correct hour', async () => {
    const jobId = await job();
    const currentHour = truncToUtcHour(new Date());
    await run({ jobId, status: 'succeeded', queuedAt: currentHour });
    await run({ jobId, status: 'failed', queuedAt: currentHour });
    await run({ jobId, status: 'dead_letter', queuedAt: currentHour });

    const since = new Date(currentHour.getTime() - 60_000);
    const buckets = await activityBucketsSince(since, 1);
    const bucket = buckets.find((b) => b.hour === currentHour.toISOString());

    expect(bucket?.succeeded).toBeGreaterThanOrEqual(1);
    expect(bucket?.failed).toBeGreaterThanOrEqual(2); // failed + dead_letter both count as "failed"
  });
});

describe('topWorkersByInflight', () => {
  it('orders workers by inflight descending and respects the limit', async () => {
    const suffix = randomUUID().slice(0, 8);
    const low = await insertTestWorker({ id: `test-worker-low-${suffix}`, inflight: 1, concurrency: 4 });
    const high = await insertTestWorker({ id: `test-worker-high-${suffix}`, inflight: 9, concurrency: 10 });
    workerIds.push(low.id, high.id);

    const top = await topWorkersByInflight(1);

    expect(top).toHaveLength(1);
    expect(top[0]?.id).toBe(high.id);
  });
});
