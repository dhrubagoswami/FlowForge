// The Postgres connection and the Drizzle instance built on it. No queries live here.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@flowforge/shared';
import { env } from '../config/env.ts';
import { logger } from '../lib/logger.ts';

// idle_timeout/connect_timeout and the event logging below are diagnostics added while chasing the
// heartbeat-freeze bug (DECISIONS.md) — the leading suspect was a hosted-free-tier connection
// (Neon/Upstash) silently dropping or stalling an idle connection with no error surfaced anywhere.
//
// max defaults to postgres.js's own default of 10 if left unset — a real defect found by the M11
// load test: at WORKER_CONCURRENCY=50, up to 50 concurrent processRun() calls contended for only
// 10 pooled connections, causing constant idle-timeout churn (repeated "connection closed" +
// reconnect) and collapsing sustained throughput to a fraction of what the queue/worker could
// otherwise do. Derived from WORKER_CONCURRENCY here specifically so the two settings can't drift
// apart again — see DECISIONS.md.
export const DB_POOL_SIZE = env.WORKER_CONCURRENCY;

const queryClient = postgres(env.DATABASE_URL, {
  max: DB_POOL_SIZE,
  idle_timeout: 60,
  connect_timeout: 10,
  onclose: (connId) => logger.warn({ connId }, 'postgres: connection closed'),
});

export const db = drizzle(queryClient, { schema });
