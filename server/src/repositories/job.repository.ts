// Queries against the jobs table. No business rules, no HTTP.
import type { JobStatus } from '@flowforge/shared';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { jobsTable } from '../db/schema/index.ts';

export type JobRow = typeof jobsTable.$inferSelect;

export async function findAllJobs(filter?: { status?: JobStatus }): Promise<JobRow[]> {
  if (filter?.status) {
    return db.select().from(jobsTable).where(eq(jobsTable.status, filter.status)).orderBy(desc(jobsTable.createdAt));
  }
  return db.select().from(jobsTable).orderBy(desc(jobsTable.createdAt));
}

export async function findJobById(id: string): Promise<JobRow | null> {
  const rows = await db.select().from(jobsTable).where(eq(jobsTable.id, id)).limit(1);
  return rows[0] ?? null;
}
