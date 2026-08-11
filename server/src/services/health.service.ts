// Liveness check: confirms the database and Redis are both reachable.
import { sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { redisConnection } from '../queue/connection.ts';

export interface HealthStatus {
  ok: boolean;
  db: { ok: boolean; error?: string };
  redis: { ok: boolean; error?: string };
}

export async function getHealthStatus(): Promise<HealthStatus> {
  const [dbCheck, redisCheck] = await Promise.all([checkDatabase(), checkRedis()]);
  return { ok: dbCheck.ok && redisCheck.ok, db: dbCheck, redis: redisCheck };
}

async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}

async function checkRedis(): Promise<{ ok: boolean; error?: string }> {
  try {
    const reply = await redisConnection.ping();
    return { ok: reply === 'PONG' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}
