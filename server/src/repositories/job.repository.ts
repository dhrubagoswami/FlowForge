// Queries against the jobs table. No business rules, no HTTP.
import type { JobStatus } from '@flowforge/shared';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { jobsTable } from '../db/schema/index.ts';

export type JobRow = typeof jobsTable.$inferSelect;
export type NewJobRow = typeof jobsTable.$inferInsert;

// A deleted job is a tombstone, not a row that stops existing — its runs table history and any
// in-flight run's job-config lookup still need it. Every list/read that feeds the API or an
// aggregation excludes it; direct-by-id lookups used by the worker/schedule-tick path do not.
export async function findAllJobs(filter?: { status?: JobStatus }): Promise<JobRow[]> {
  const notDeleted = isNull(jobsTable.deletedAt);
  const whereClause = filter?.status ? and(notDeleted, eq(jobsTable.status, filter.status)) : notDeleted;
  return db.select().from(jobsTable).where(whereClause).orderBy(desc(jobsTable.createdAt));
}

export async function findJobById(id: string): Promise<JobRow | null> {
  const rows = await db
    .select()
    .from(jobsTable)
    .where(and(eq(jobsTable.id, id), isNull(jobsTable.deletedAt)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertJob(values: NewJobRow): Promise<JobRow> {
  const [row] = await db.insert(jobsTable).values(values).returning();
  if (!row) throw new Error('insertJob: insert returned no row');
  return row;
}

export async function updateJob(id: string, values: Partial<NewJobRow>): Promise<JobRow | null> {
  const [row] = await db
    .update(jobsTable)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(jobsTable.id, id), isNull(jobsTable.deletedAt)))
    .returning();
  return row ?? null;
}

export async function softDeleteJob(id: string): Promise<JobRow | null> {
  const [row] = await db
    .update(jobsTable)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(jobsTable.id, id), isNull(jobsTable.deletedAt)))
    .returning();
  return row ?? null;
}
