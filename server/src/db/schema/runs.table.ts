// The runs table — one row per logical job execution, updated in place across retries.
import { RUN_STATUSES, RUN_TRIGGER_SOURCES } from '@flowforge/shared';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { jobsTable } from './jobs.table.ts';
import { workersTable } from './workers.table.ts';

export const runStatusEnum = pgEnum('run_status', RUN_STATUSES);
export const runTriggerSourceEnum = pgEnum('run_trigger_source', RUN_TRIGGER_SOURCES);

export const runsTable = pgTable(
  'runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: text('job_id')
      .notNull()
      .references(() => jobsTable.id),
    status: runStatusEnum('status').notNull(),
    triggerSource: runTriggerSourceEnum('trigger_source').notNull(),
    attempt: integer('attempt').notNull().default(1),
    maxAttempts: integer('max_attempts').notNull(),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    waitMs: integer('wait_ms'),
    workerId: text('worker_id').references(() => workersTable.id),
    idempotencyKey: text('idempotency_key').notNull(),
    errorMessage: text('error_message'),
    errorType: text('error_type'),
    output: jsonb('output'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('runs_job_id_queued_at_idx').on(table.jobId, table.queuedAt.desc()),
    index('runs_status_idx').on(table.status),
    index('runs_queued_at_idx').on(table.queuedAt.desc()),
    index('runs_idempotency_key_idx').on(table.idempotencyKey),
  ],
);
