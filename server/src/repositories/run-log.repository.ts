// Queries against the run_logs table. No business rules, no HTTP.
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { runLogsTable } from '../db/schema/index.ts';

export type RunLogRow = typeof runLogsTable.$inferSelect;

export async function findLogsByRunId(params: { runId: string; since?: Date }): Promise<RunLogRow[]> {
  const { runId, since } = params;
  const whereClause = since ? and(eq(runLogsTable.runId, runId), gt(runLogsTable.ts, since)) : eq(runLogsTable.runId, runId);

  return db.select().from(runLogsTable).where(whereClause).orderBy(asc(runLogsTable.ts), asc(runLogsTable.id));
}
