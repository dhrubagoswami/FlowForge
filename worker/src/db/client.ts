// The Postgres connection and the Drizzle instance built on it. No queries live here.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@flowforge/shared';
import { env } from '../config/env.ts';

const queryClient = postgres(env.DATABASE_URL);

export const db = drizzle(queryClient, { schema });
