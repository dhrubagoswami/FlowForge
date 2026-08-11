import type { JobDetail, JobSummary } from '@flowforge/shared';
import type { JobDetailData, JobRow } from '../types.ts';
import { formatDuration, formatRelativeToNow, formatUntilNow } from './format.ts';
import { HEALTH_TAG_CLASS } from './tags.ts';

export function toJobRow(job: JobSummary, open: () => void): JobRow {
  const rate = job.successRatePct;
  return {
    id: job.id,
    // The slug (job.id) is the on-screen name, matching the ops-dashboard convention in every
    // screenshot — it's what shows up in logs/configs. job.name (the human title) is unused here.
    name: job.id,
    trigger: job.triggerType === 'webhook' ? 'webhook' : 'cron',
    schedLabel: job.schedLabel,
    status: job.health,
    rate,
    last: formatRelativeToNow(job.lastRunAt),
    avg: formatDuration(job.avgDurationMs),
    next: job.status === 'paused' ? 'paused' : formatUntilNow(job.nextRunAt),
    tagClass: HEALTH_TAG_CLASS[job.health],
    pct: `${Math.min(100, rate).toFixed(1)}%`,
    fill: rate > 98 ? 'var(--color-accent-2-500)' : 'var(--color-accent)',
    open,
  };
}

function jobConfigToYaml(job: JobDetail): string {
  const lines = [`name: ${job.config.name}`, 'trigger:', `  type: ${job.config.trigger.type}`];
  if (job.config.trigger.expr) lines.push(`  expr: "${job.config.trigger.expr}"`);
  if (job.config.trigger.tz) lines.push(`  tz: ${job.config.trigger.tz}`);
  lines.push('task:', `  type: ${job.config.task.type}`, `timeoutMs: ${job.config.timeoutMs}`);
  lines.push('retry:', `  attempts: ${job.config.retry.attempts}`, `  backoff: ${job.config.retry.backoff}`, `  baseMs: ${job.config.retry.baseMs}`);
  lines.push('idempotency:', `  key: "${job.config.idempotency.keyTemplate}"`, `  ttlSeconds: ${job.config.idempotency.ttlSeconds}`);
  lines.push('alert:', `  afterConsecutiveFailures: ${job.config.alert.afterConsecutiveFailures}`);
  if (job.config.alert.channel) lines.push(`  channel: ${job.config.alert.channel}`);
  return lines.join('\n');
}

export function toJobDetailData(job: JobDetail): JobDetailData {
  return {
    id: job.id,
    name: job.id,
    trigger: job.triggerType === 'webhook' ? 'webhook' : 'cron',
    schedLabel: job.schedLabel,
    status: job.health,
    rate: job.successRatePct,
    last: formatRelativeToNow(job.lastRunAt),
    avg: formatDuration(job.avgDurationMs),
    next: job.status === 'paused' ? 'paused' : formatUntilNow(job.nextRunAt),
    tagClass: HEALTH_TAG_CLASS[job.health],
    yaml: jobConfigToYaml(job),
  };
}

export function guaranteesForJob(job: JobDetail): { k: string; v: string }[] {
  return [
    { k: 'Idempotency key', v: job.config.idempotency.keyTemplate },
    { k: 'Key TTL', v: `${Math.round(job.config.idempotency.ttlSeconds / 3600)}h` },
    { k: 'Retry policy', v: `${job.config.retry.attempts} × ${job.config.retry.backoff}, base ${Math.round(job.config.retry.baseMs / 1000)}s` },
    { k: 'Timeout', v: `${Math.round(job.config.timeoutMs / 1000)}s` },
    { k: 'Alerting', v: job.config.alert.channel ? `${job.config.alert.channel} after ${job.config.alert.afterConsecutiveFailures}` : `after ${job.config.alert.afterConsecutiveFailures} failures` },
  ];
}
