// report.generate — aggregates FlowForge's own run data over a window into a summary record.
import type { TaskInputFor } from '@flowforge/shared';
import { runsTable } from '@flowforge/shared';
import { gte, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import type { TaskLogger } from '../lib/task-logger.ts';

export async function runReportGenerate(input: TaskInputFor<'report.generate'>, log: TaskLogger): Promise<Record<string, unknown>> {
  await log('info', `aggregating the last ${input.windowHours}h of runs, grouped by ${input.groupBy}`);

  const since = new Date(Date.now() - input.windowHours * 60 * 60 * 1000);
  // groupBy is free text at the schema level; only "status" and "jobId" are actually grouped —
  // anything else falls back to jobId rather than rejecting the run.
  const groupColumn = input.groupBy === 'status' ? runsTable.status : runsTable.jobId;

  const rows = await db
    .select({ group: groupColumn, count: sql<number>`count(*)`.mapWith(Number) })
    .from(runsTable)
    .where(gte(runsTable.queuedAt, since))
    .groupBy(groupColumn);

  await log('ok', `report generated: ${rows.length} groups`);
  return { windowHours: input.windowHours, groupBy: input.groupBy, groups: rows };
}
