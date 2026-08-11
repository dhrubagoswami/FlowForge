// The workers table — the fleet. Offline status is derived on read from a stale last_heartbeat_at, not stored.
import { WORKER_STATUSES } from '../../constants/enums.ts';
import { integer, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const workerStatusEnum = pgEnum('worker_status', WORKER_STATUSES);

export const workersTable = pgTable('workers', {
  id: text('id').primaryKey(),
  hostname: text('hostname').notNull(),
  status: workerStatusEnum('status').notNull().default('online'),
  concurrency: integer('concurrency').notNull(),
  inflight: integer('inflight').notNull().default(0),
  lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  version: text('version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
