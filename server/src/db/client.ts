// The Postgres connection and the Drizzle instance built on it. No queries live here.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.ts';
import { logger } from '../lib/logger.ts';
import * as schema from './schema/index.ts';

// idle_timeout/connect_timeout and onclose logging are diagnostics added while chasing the
// heartbeat-freeze bug (DECISIONS.md) — the leading suspect was a hosted-free-tier connection
// (Neon/Upstash) silently dropping or stalling an idle connection with no error surfaced anywhere.
const queryClient = postgres(env.DATABASE_URL, {
  idle_timeout: 60,
  connect_timeout: 10,
  onclose: (connId) => logger.warn({ connId }, 'postgres: connection closed'),
});

export const db = drizzle(queryClient, { schema });
