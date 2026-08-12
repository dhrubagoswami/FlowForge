// Shared setup/teardown helpers for real-DB integration tests (Group B). Not a test file itself.
// Every insert is tracked by the caller's own id list and deleted in the test's afterEach — a
// fixture row leaked into a later test could make that test pass for the wrong reason, so cleanup
// is explicit rather than relying on transaction rollback (there's no shared transaction wrapper
// here, since each repository call under test opens its own connection through the shared `db`).
//
// IMPORTANT — this points at the same database used for manual QA and demo clicks, not an
// isolated test database. NEVER write a test that assumes some slice of the table is empty (e.g.
// "this hour has no runs yet"), even one that looks obviously true. It will pass locally and flake
// later once real rows land nearby. Instead, snapshot the query result before inserting fixture
// data, then assert the delta after inserting — see stats.repository.test.ts's
// activityBucketsSince gap-hour test for the pattern.
import { randomUUID } from 'node:crypto';
import { jobsTable, runsTable, workersTable } from '@flowforge/shared';
import type { RunStatus } from '@flowforge/shared';
import { inArray } from 'drizzle-orm';
import { db } from '../db/client.ts';

export async function insertTestJob(overrides: Partial<typeof jobsTable.$inferInsert> = {}) {
  const id = overrides.id ?? `test-job-${randomUUID()}`;
  const [row] = await db
    .insert(jobsTable)
    .values({
      name: 'Test Job',
      triggerType: 'manual',
      taskType: 'simulate',
      taskInput: { durationMs: 100, failureMode: 'none', failureRate: 0 },
      idempotencyKeyTemplate: 'test:{{runId}}',
      createdBy: 'test-fixture',
      ...overrides,
      id,
    })
    .returning();
  if (!row) throw new Error('insertTestJob: insert returned no row');
  return row;
}

export async function insertTestWorker(overrides: Partial<typeof workersTable.$inferInsert> = {}) {
  const id = overrides.id ?? `test-worker-${randomUUID()}`;
  const [row] = await db
    .insert(workersTable)
    .values({
      hostname: id,
      concurrency: 4,
      version: 'test',
      ...overrides,
      id,
    })
    .returning();
  if (!row) throw new Error('insertTestWorker: insert returned no row');
  return row;
}

export interface TestRunOverrides {
  id?: string;
  jobId: string;
  status?: RunStatus;
  queuedAt?: Date;
  waitMs?: number | null;
  workerId?: string | null;
  errorType?: string | null;
}

export async function insertTestRun(overrides: TestRunOverrides) {
  const [row] = await db
    .insert(runsTable)
    .values({
      status: 'queued',
      triggerSource: 'manual',
      maxAttempts: 3,
      queuedAt: new Date(),
      idempotencyKey: `test:${randomUUID()}`,
      ...overrides,
    })
    .returning();
  if (!row) throw new Error('insertTestRun: insert returned no row');
  return row;
}

export async function cleanupJobs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(jobsTable).where(inArray(jobsTable.id, ids));
}

export async function cleanupWorkers(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(workersTable).where(inArray(workersTable.id, ids));
}

export async function cleanupRuns(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(runsTable).where(inArray(runsTable.id, ids));
}
