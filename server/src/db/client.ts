// The Postgres connection and the Drizzle instance built on it. No queries live here.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.ts';
import * as schema from './schema/index.ts';

const queryClient = postgres(env.DATABASE_URL);

export const db = drizzle(queryClient, { schema });
