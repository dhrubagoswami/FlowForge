// The idempotency_records table — one row per computed idempotency key, guards duplicate execution via unique-constraint conflict.
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const idempotencyTable = pgTable('idempotency_records', {
  key: text('key').primaryKey(),
  runId: uuid('run_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
