// The jobs table — one row per defined job. Trigger, task, retry, idempotency, and alert config live here.
import { JOB_HEALTHS, JOB_STATUSES, RETRY_BACKOFFS, TASK_TYPES, TRIGGER_TYPES } from '@flowforge/shared';
import { integer, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const triggerTypeEnum = pgEnum('trigger_type', TRIGGER_TYPES);
export const jobStatusEnum = pgEnum('job_status', JOB_STATUSES);
export const jobHealthEnum = pgEnum('job_health', JOB_HEALTHS);
export const retryBackoffEnum = pgEnum('retry_backoff', RETRY_BACKOFFS);
export const taskTypeEnum = pgEnum('task_type', TASK_TYPES);

export const jobsTable = pgTable('jobs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  triggerType: triggerTypeEnum('trigger_type').notNull(),
  cronExpr: text('cron_expr'),
  timezone: text('timezone').notNull().default('UTC'),
  taskType: taskTypeEnum('task_type').notNull(),
  taskInput: jsonb('task_input').notNull(),
  status: jobStatusEnum('status').notNull().default('active'),
  health: jobHealthEnum('health').notNull().default('healthy'),
  timeoutMs: integer('timeout_ms').notNull().default(120000),
  retryAttempts: integer('retry_attempts').notNull().default(3),
  retryBackoff: retryBackoffEnum('retry_backoff').notNull().default('exponential'),
  retryBaseMs: integer('retry_base_ms').notNull().default(30000),
  idempotencyKeyTemplate: text('idempotency_key_template').notNull(),
  idempotencyTtlSeconds: integer('idempotency_ttl_seconds').notNull().default(86400),
  alertAfterConsecutiveFailures: integer('alert_after_consecutive_failures').notNull().default(3),
  alertChannel: text('alert_channel'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
