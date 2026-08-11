// Queries against the workers table. No business rules, no HTTP.
import { desc } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { workersTable } from '../db/schema/index.ts';

export type WorkerRow = typeof workersTable.$inferSelect;

export async function findAllWorkers(): Promise<WorkerRow[]> {
  return db.select().from(workersTable).orderBy(desc(workersTable.lastHeartbeatAt));
}
