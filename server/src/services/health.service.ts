// Liveness check: confirms the database is reachable. Redis isn't wired until the queue exists at M5.
import { sql } from 'drizzle-orm';
import { REDIS_NOT_WIRED_REASON } from '../config/constants.ts';
import { db } from '../db/client.ts';

export interface HealthStatus {
  ok: boolean;
  db: { ok: boolean; error?: string };
  redis: { ok: boolean; reason: string };
}

// TODO(M5): replace this stub with a real Redis ping once queue/connection.ts exists.
export async function getHealthStatus(): Promise<HealthStatus> {
  const dbCheck = await checkDatabase();
  return {
    ok: dbCheck.ok,
    db: dbCheck,
    redis: { ok: false, reason: REDIS_NOT_WIRED_REASON },
  };
}

async function checkDatabase(): Promise<{ ok: boolean; error?: string }> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}
