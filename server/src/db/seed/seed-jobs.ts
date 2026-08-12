// The six seeded job definitions — same names/stories as web/src/data/mockData.ts, all using the `simulate` task so history is reproducible with no live network calls.
import type { FailureMode, JobHealth, TaskType, TriggerType } from '@flowforge/shared';

export interface SeedJobDef {
  id: string;
  name: string;
  description: string;
  triggerType: TriggerType;
  cronExpr: string | null;
  timezone: string;
  taskType: TaskType;
  taskInput: { durationMs: number; failureMode: FailureMode; failureRate?: number };
  status: 'active' | 'paused';
  timeoutMs: number;
  retryAttempts: number;
  retryBackoff: 'fixed' | 'exponential';
  retryBaseMs: number;
  idempotencyKeyTemplate: string;
  idempotencyTtlSeconds: number;
  alertAfterConsecutiveFailures: number;
  alertChannel: string | null;
  createdBy: 'user' | 'ai-composer';
  /** Approximate daily run count used by the run generator — not stored on the row. */
  dailyRunTarget: number;
  /** Baseline day-to-day success rate before any degradation story is applied. */
  baseSuccessRate: number;
  /**
   * A secondary failure mode mixed in alongside taskInput.failureMode, so a job's failures
   * aren't all one error_type/message. Omit for jobs whose story is one dominant failure kind.
   */
  secondaryFailureMode?: FailureMode;
  /** Fraction (0-1) of a job's failures that draw the secondary mode instead of the primary one. */
  secondaryFailureModeShare?: number;
  /** The health this job's story is designed to produce. Checked by an assertion at the end of the seed — the seed fails loudly if the generated data doesn't actually land here. */
  intendedHealth: JobHealth;
}

export const SEED_JOBS: SeedJobDef[] = [
  {
    id: 'competitor-pricing-scrape',
    name: 'Competitor Pricing Scrape',
    description: 'Scrapes the competitor pricing page daily and diffs against the previous snapshot.',
    triggerType: 'cron',
    cronExpr: '0 9 * * *',
    timezone: 'UTC',
    taskType: 'simulate',
    taskInput: { durationMs: 12000, failureMode: 'none', failureRate: 0.01 },
    status: 'active',
    timeoutMs: 120000,
    retryAttempts: 3,
    retryBackoff: 'exponential',
    retryBaseMs: 30000,
    idempotencyKeyTemplate: '{{job}}:{{scheduled_at}}',
    idempotencyTtlSeconds: 86400,
    alertAfterConsecutiveFailures: 3,
    alertChannel: 'slack#ops',
    createdBy: 'user',
    dailyRunTarget: 1,
    baseSuccessRate: 0.994,
    intendedHealth: 'healthy',
  },
  {
    id: 'postgres-nightly-backup',
    name: 'Postgres Nightly Backup',
    description: 'Backs up the primary Postgres database nightly.',
    triggerType: 'cron',
    cronExpr: '0 2 * * *',
    timezone: 'UTC',
    taskType: 'simulate',
    taskInput: { durationMs: 221000, failureMode: 'none' },
    status: 'active',
    timeoutMs: 600000,
    retryAttempts: 3,
    retryBackoff: 'exponential',
    retryBaseMs: 60000,
    idempotencyKeyTemplate: '{{job}}:{{scheduled_at}}',
    idempotencyTtlSeconds: 86400,
    alertAfterConsecutiveFailures: 2,
    alertChannel: 'slack#ops',
    createdBy: 'user',
    dailyRunTarget: 1,
    baseSuccessRate: 1.0,
    intendedHealth: 'healthy',
  },
  {
    id: 'stripe-webhook-reconcile',
    name: 'Stripe Webhook Reconcile',
    description: 'Reconciles an incoming Stripe invoice webhook against the ledger.',
    triggerType: 'webhook',
    cronExpr: null,
    timezone: 'UTC',
    taskType: 'simulate',
    taskInput: { durationMs: 840, failureMode: 'rate_limit', failureRate: 1 },
    status: 'active',
    timeoutMs: 15000,
    retryAttempts: 3,
    retryBackoff: 'exponential',
    retryBaseMs: 5000,
    idempotencyKeyTemplate: '{{job}}:{{input_hash}}',
    idempotencyTtlSeconds: 86400,
    alertAfterConsecutiveFailures: 5,
    alertChannel: 'slack#payments',
    createdBy: 'user',
    dailyRunTarget: 105,
    baseSuccessRate: 0.9,
    secondaryFailureMode: 'timeout',
    secondaryFailureModeShare: 0.35,
    intendedHealth: 'degraded',
  },
  {
    id: 'docs-embedding-index',
    name: 'Docs Embedding Index',
    description: 'Re-embeds changed docs into the vector index every 30 minutes.',
    triggerType: 'cron',
    cronExpr: '*/30 * * * *',
    timezone: 'UTC',
    taskType: 'simulate',
    taskInput: { durationMs: 48000, failureMode: 'rate_limit', failureRate: 0.3 },
    status: 'active',
    timeoutMs: 300000,
    retryAttempts: 3,
    retryBackoff: 'exponential',
    retryBaseMs: 15000,
    idempotencyKeyTemplate: '{{job}}:{{scheduled_at}}',
    idempotencyTtlSeconds: 604800,
    alertAfterConsecutiveFailures: 2,
    alertChannel: null,
    createdBy: 'user',
    dailyRunTarget: 48,
    baseSuccessRate: 0.718,
    secondaryFailureMode: 'timeout',
    secondaryFailureModeShare: 0.2,
    intendedHealth: 'failing',
  },
  {
    id: 'slack-weekly-digest',
    name: 'Slack Weekly Digest',
    description: 'Posts a weekly activity digest to Slack.',
    triggerType: 'cron',
    cronExpr: '0 15 * * 1',
    timezone: 'UTC',
    taskType: 'simulate',
    taskInput: { durationMs: 6100, failureMode: 'none' },
    status: 'active',
    timeoutMs: 30000,
    retryAttempts: 3,
    retryBackoff: 'exponential',
    retryBaseMs: 10000,
    idempotencyKeyTemplate: '{{job}}:{{scheduled_at}}',
    idempotencyTtlSeconds: 86400,
    alertAfterConsecutiveFailures: 3,
    alertChannel: 'slack#ops',
    createdBy: 'user',
    dailyRunTarget: 1 / 7,
    baseSuccessRate: 1.0,
    intendedHealth: 'healthy',
  },
  {
    id: 'churn-model-retrain',
    name: 'Churn Model Retrain',
    description: 'Retrains the churn prediction model on the latest weekly data.',
    triggerType: 'cron',
    cronExpr: '0 4 * * 0',
    timezone: 'UTC',
    taskType: 'simulate',
    taskInput: { durationMs: 840000, failureMode: 'none', failureRate: 0.03 },
    status: 'paused',
    timeoutMs: 900000,
    retryAttempts: 2,
    retryBackoff: 'fixed',
    retryBaseMs: 60000,
    idempotencyKeyTemplate: '{{job}}:{{scheduled_at}}',
    idempotencyTtlSeconds: 604800,
    alertAfterConsecutiveFailures: 2,
    alertChannel: 'slack#ml',
    createdBy: 'user',
    dailyRunTarget: 1 / 7,
    baseSuccessRate: 0.982,
    intendedHealth: 'paused',
  },
];
