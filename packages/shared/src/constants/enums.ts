// Every enum used by the DB schema, the API contract, and JobConfig — one definition each, shared by server, worker, and web.
import { z } from 'zod';

export const TRIGGER_TYPES = ['cron', 'webhook', 'manual'] as const;
export const triggerTypeSchema = z.enum(TRIGGER_TYPES);
export type TriggerType = z.infer<typeof triggerTypeSchema>;

export const JOB_STATUSES = ['active', 'paused'] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const JOB_HEALTHS = ['healthy', 'degraded', 'failing', 'paused'] as const;
export const jobHealthSchema = z.enum(JOB_HEALTHS);
export type JobHealth = z.infer<typeof jobHealthSchema>;

export const RETRY_BACKOFFS = ['fixed', 'exponential'] as const;
export const retryBackoffSchema = z.enum(RETRY_BACKOFFS);
export type RetryBackoff = z.infer<typeof retryBackoffSchema>;

export const RUN_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'retrying',
  'dead_letter',
  'cancelled',
  'skipped_duplicate',
] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const RUN_TRIGGER_SOURCES = ['schedule', 'manual', 'webhook', 'demo'] as const;
export const runTriggerSourceSchema = z.enum(RUN_TRIGGER_SOURCES);
export type RunTriggerSource = z.infer<typeof runTriggerSourceSchema>;

export const LOG_LEVELS = ['info', 'ok', 'warn', 'error'] as const;
export const logLevelSchema = z.enum(LOG_LEVELS);
export type LogLevel = z.infer<typeof logLevelSchema>;

export const WORKER_STATUSES = ['online', 'draining', 'offline'] as const;
export const workerStatusSchema = z.enum(WORKER_STATUSES);
export type WorkerStatus = z.infer<typeof workerStatusSchema>;

export const AI_CACHE_KINDS = ['compose', 'diagnose'] as const;
export const aiCacheKindSchema = z.enum(AI_CACHE_KINDS);
export type AiCacheKind = z.infer<typeof aiCacheKindSchema>;

export const TASK_TYPES = [
  'http.check',
  'http.fetch_json',
  'report.generate',
  'notify.webhook',
  'db.snapshot',
  'simulate',
] as const;
export const taskTypeSchema = z.enum(TASK_TYPES);
export type TaskType = z.infer<typeof taskTypeSchema>;

export const FAILURE_MODES = ['rate_limit', 'timeout', 'crash', 'none'] as const;
export const failureModeSchema = z.enum(FAILURE_MODES);
export type FailureMode = z.infer<typeof failureModeSchema>;

export const IDEMPOTENCY_TEMPLATE_TOKENS = ['job', 'scheduled_at', 'input_hash'] as const;
export type IdempotencyTemplateToken = (typeof IDEMPOTENCY_TEMPLATE_TOKENS)[number];
