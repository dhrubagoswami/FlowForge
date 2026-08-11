// Queries against the runs table. No business rules, no HTTP.
import type { RunStatus } from '@flowforge/shared';
import { and, desc, eq, gte, lt, or } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { jobsTable, runsTable } from '../db/schema/index.ts';
import type { RunCursor } from '../lib/pagination-cursor.util.ts';

export type RunRow = typeof runsTable.$inferSelect;
export interface RunRowWithJobName extends RunRow {
  jobName: string;
}

function keysetWhereClause(cursor: RunCursor | null) {
  if (!cursor) return undefined;
  return or(lt(runsTable.queuedAt, cursor.queuedAt), and(eq(runsTable.queuedAt, cursor.queuedAt), lt(runsTable.id, cursor.id)));
}

export async function findRunsByJobId(params: { jobId: string; limit: number; cursor: RunCursor | null }): Promise<RunRow[]> {
  const { jobId, limit, cursor } = params;
  const whereClause = cursor ? and(eq(runsTable.jobId, jobId), keysetWhereClause(cursor)) : eq(runsTable.jobId, jobId);

  return db
    .select()
    .from(runsTable)
    .where(whereClause)
    .orderBy(desc(runsTable.queuedAt), desc(runsTable.id))
    .limit(limit);
}

export async function findRecentRuns(params: { limit: number; status?: RunStatus }): Promise<RunRowWithJobName[]> {
  const { limit, status } = params;
  const whereClause = status ? eq(runsTable.status, status) : undefined;

  const rows = await db
    .select({ run: runsTable, jobName: jobsTable.name })
    .from(runsTable)
    .innerJoin(jobsTable, eq(runsTable.jobId, jobsTable.id))
    .where(whereClause)
    .orderBy(desc(runsTable.queuedAt))
    .limit(limit);

  return rows.map((r) => ({ ...r.run, jobName: r.jobName }));
}

export async function findRunById(id: string): Promise<RunRowWithJobName | null> {
  const rows = await db
    .select({ run: runsTable, jobName: jobsTable.name })
    .from(runsTable)
    .innerJoin(jobsTable, eq(runsTable.jobId, jobsTable.id))
    .where(eq(runsTable.id, id))
    .limit(1);

  const row = rows[0];
  return row ? { ...row.run, jobName: row.jobName } : null;
}

export async function findLastNRunStatusesByJobId(jobId: string, n: number): Promise<RunStatus[]> {
  const rows = await db
    .select({ status: runsTable.status })
    .from(runsTable)
    .where(eq(runsTable.jobId, jobId))
    .orderBy(desc(runsTable.queuedAt))
    .limit(n);
  return rows.map((r) => r.status);
}

export async function findFailedRunsSince(since: Date, jobId?: string): Promise<RunRowWithJobName[]> {
  const statusFilter = or(eq(runsTable.status, 'failed'), eq(runsTable.status, 'dead_letter'));
  const whereClause = jobId ? and(gte(runsTable.queuedAt, since), statusFilter, eq(runsTable.jobId, jobId)) : and(gte(runsTable.queuedAt, since), statusFilter);

  const rows = await db
    .select({ run: runsTable, jobName: jobsTable.name })
    .from(runsTable)
    .innerJoin(jobsTable, eq(runsTable.jobId, jobsTable.id))
    .where(whereClause)
    .orderBy(desc(runsTable.queuedAt));

  return rows.map((r) => ({ ...r.run, jobName: r.jobName }));
}
