// Queries against the workers table. No business rules, no HTTP.
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { workersTable } from '../db/schema/index.ts';

export type WorkerRow = typeof workersTable.$inferSelect;
export type WorkerStatus = WorkerRow['status'];

export async function findAllWorkers(): Promise<WorkerRow[]> {
  return db.select().from(workersTable).orderBy(desc(workersTable.lastHeartbeatAt));
}

export async function setWorkerStatus(id: string, status: WorkerStatus): Promise<WorkerRow | null> {
  const [row] = await db.update(workersTable).set({ status, updatedAt: new Date() }).where(eq(workersTable.id, id)).returning();
  return row ?? null;
}

export async function backdateWorkerHeartbeat(id: string, status: WorkerStatus, heartbeatAt: Date): Promise<WorkerRow | null> {
  const [row] = await db.update(workersTable).set({ status, lastHeartbeatAt: heartbeatAt, updatedAt: new Date() }).where(eq(workersTable.id, id)).returning();
  return row ?? null;
}

export async function restoreWorkerHeartbeat(id: string, heartbeatAt: Date): Promise<WorkerRow | null> {
  const [row] = await db.update(workersTable).set({ status: 'online', lastHeartbeatAt: heartbeatAt, updatedAt: new Date() }).where(eq(workersTable.id, id)).returning();
  return row ?? null;
}
