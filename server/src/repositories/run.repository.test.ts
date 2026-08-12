// Integration tests against the real database. findRunsByJobId's keyset pagination is the reason
// this file exists: the OR clause (queuedAt < cursor.queuedAt) OR (queuedAt = cursor.queuedAt AND
// id < cursor.id) only earns its keep when two rows share the exact same queuedAt — a fixture with
// all-distinct timestamps would pass even if the tie-break half of that clause were deleted.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupJobs, cleanupRuns, insertTestJob, insertTestRun } from '../test-support/db-fixtures.ts';
import { findFailedRunsSince, findRunById, findRunsByJobId, findRecentRuns } from './run.repository.ts';

const jobIds: string[] = [];
const runIds: string[] = [];

afterEach(async () => {
  await cleanupRuns(runIds.splice(0));
  await cleanupJobs(jobIds.splice(0));
});

async function job(overrides: Parameters<typeof insertTestJob>[0] = {}) {
  const row = await insertTestJob(overrides);
  jobIds.push(row.id);
  return row.id;
}

async function run(overrides: Parameters<typeof insertTestRun>[0]) {
  const row = await insertTestRun(overrides);
  runIds.push(row.id);
  return row;
}

describe('findRunsByJobId — keyset pagination', () => {
  it('breaks a tie on identical queuedAt by descending id, not by insertion order', async () => {
    const jobId = await job();
    const sameInstant = new Date('2026-08-01T00:00:00.000Z');
    const rows = await Promise.all([
      run({ jobId, queuedAt: sameInstant }),
      run({ jobId, queuedAt: sameInstant }),
      run({ jobId, queuedAt: sameInstant }),
    ]);
    const sortedByIdDesc = [...rows].sort((a, b) => (a.id < b.id ? 1 : -1));

    const page1 = await findRunsByJobId({ jobId, limit: 2, cursor: null });
    expect(page1.map((r) => r.id)).toEqual(sortedByIdDesc.slice(0, 2).map((r) => r.id));

    const lastOfPage1 = page1[page1.length - 1];
    if (!lastOfPage1) throw new Error('page1 unexpectedly empty');
    const page2 = await findRunsByJobId({ jobId, limit: 2, cursor: { queuedAt: lastOfPage1.queuedAt, id: lastOfPage1.id } });

    // The tie-break must exclude everything already returned in page1 and continue past the tie,
    // not repeat or skip a row that shares the same queuedAt as the cursor.
    expect(page2.map((r) => r.id)).toEqual(sortedByIdDesc.slice(2).map((r) => r.id));
    const allIds = [...page1, ...page2].map((r) => r.id).sort();
    expect(allIds).toEqual([...rows.map((r) => r.id)].sort());
  });

  it('paginates correctly across distinct queuedAt values, newest first', async () => {
    const jobId = await job();
    const t1 = new Date('2026-08-01T00:00:00.000Z');
    const t2 = new Date('2026-08-01T01:00:00.000Z');
    const t3 = new Date('2026-08-01T02:00:00.000Z');
    const r1 = await run({ jobId, queuedAt: t1 });
    const r2 = await run({ jobId, queuedAt: t2 });
    const r3 = await run({ jobId, queuedAt: t3 });

    const page1 = await findRunsByJobId({ jobId, limit: 2, cursor: null });
    expect(page1.map((r) => r.id)).toEqual([r3.id, r2.id]);

    const cursorRow = page1[1];
    if (!cursorRow) throw new Error('page1 missing expected row');
    const page2 = await findRunsByJobId({ jobId, limit: 2, cursor: { queuedAt: cursorRow.queuedAt, id: cursorRow.id } });
    expect(page2.map((r) => r.id)).toEqual([r1.id]);
  });

  it('only returns runs for the requested jobId', async () => {
    const jobIdA = await job();
    const jobIdB = await job();
    const runA = await run({ jobId: jobIdA, queuedAt: new Date() });
    await run({ jobId: jobIdB, queuedAt: new Date() });

    const results = await findRunsByJobId({ jobId: jobIdA, limit: 10, cursor: null });

    expect(results.map((r) => r.id)).toEqual([runA.id]);
  });
});

describe('findRecentRuns', () => {
  it('joins the job name and orders by queuedAt descending', async () => {
    // findRecentRuns is unscoped by design (it feeds the Overview's global "recent runs" list), so
    // this can't isolate by jobId like the other tests here — instead it queues the newer run far
    // enough in the future that it's guaranteed to sort first regardless of what other tests or
    // manual DB use have left behind.
    const jobId = await job({ name: 'Recent Runs Join Test' });
    await run({ jobId, queuedAt: new Date(Date.now() - 10_000) });
    const newer = await run({ jobId, queuedAt: new Date(Date.now() + 3_600_000) });

    const results = await findRecentRuns({ limit: 1 });

    expect(results[0]?.id).toBe(newer.id);
    expect(results[0]?.jobName).toBe('Recent Runs Join Test');
  });

  it('filters by status when provided', async () => {
    const jobId = await job();
    await run({ jobId, status: 'succeeded', queuedAt: new Date() });
    const failed = await run({ jobId, status: 'failed', queuedAt: new Date() });

    const results = await findRecentRuns({ limit: 50, status: 'failed' });

    expect(results.some((r) => r.id === failed.id)).toBe(true);
    expect(results.every((r) => r.status === 'failed')).toBe(true);
  });
});

describe('findRunById', () => {
  it('returns the run joined with its job name', async () => {
    const jobId = await job({ name: 'FindById Join Test' });
    const created = await run({ jobId, queuedAt: new Date() });

    const result = await findRunById(created.id);

    expect(result?.id).toBe(created.id);
    expect(result?.jobName).toBe('FindById Join Test');
  });

  it('returns null when the run does not exist', async () => {
    const result = await findRunById('00000000-0000-0000-0000-000000000000');
    expect(result).toBeNull();
  });
});

describe('findFailedRunsSince', () => {
  it('includes both failed and dead_letter statuses, excludes others, and respects the since cutoff', async () => {
    const jobId = await job();
    const since = new Date(Date.now() - 60_000);
    const failed = await run({ jobId, status: 'failed', queuedAt: new Date() });
    const deadLetter = await run({ jobId, status: 'dead_letter', queuedAt: new Date() });
    await run({ jobId, status: 'succeeded', queuedAt: new Date() });
    await run({ jobId, status: 'failed', queuedAt: new Date(since.getTime() - 3_600_000) }); // before the window

    const results = await findFailedRunsSince(since);
    const ids = results.filter((r) => r.jobId === jobId).map((r) => r.id);

    expect(ids).toEqual(expect.arrayContaining([failed.id, deadLetter.id]));
    expect(ids).toHaveLength(2);
  });

  it('filters by jobId when provided', async () => {
    const jobIdA = await job();
    const jobIdB = await job();
    const since = new Date(Date.now() - 60_000);
    const failedA = await run({ jobId: jobIdA, status: 'failed', queuedAt: new Date() });
    await run({ jobId: jobIdB, status: 'failed', queuedAt: new Date() });

    const results = await findFailedRunsSince(since, jobIdA);

    expect(results.map((r) => r.id)).toEqual([failedA.id]);
  });
});
