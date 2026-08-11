// db.snapshot — snapshots a table's row count into a record. Only FlowForge's own known tables are allowed, per §2's "no arbitrary user-supplied code" rule.
import type { TaskInputFor } from '@flowforge/shared';
import { jobsTable, runLogsTable, runsTable, workersTable } from '@flowforge/shared';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import type { TaskLogger } from '../lib/task-logger.ts';

const SNAPSHOTTABLE_TABLES = {
  jobs: jobsTable,
  runs: runsTable,
  run_logs: runLogsTable,
  workers: workersTable,
} as const;

export async function runDbSnapshot(input: TaskInputFor<'db.snapshot'>, log: TaskLogger): Promise<Record<string, unknown>> {
  const table = SNAPSHOTTABLE_TABLES[input.table as keyof typeof SNAPSHOTTABLE_TABLES];
  if (!table) {
    const message = `"${input.table}" is not a snapshot-able table. Allowed: ${Object.keys(SNAPSHOTTABLE_TABLES).join(', ')}`;
    await log('error', message);
    throw new Error(message);
  }

  await log('info', `snapshotting row count for "${input.table}"`);
  const [row] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(table);

  await log('ok', `"${input.table}" has ${row?.count ?? 0} rows`);
  return { table: input.table, rowCount: row?.count ?? 0 };
}
