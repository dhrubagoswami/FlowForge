// Renders a JobConfig as YAML for display (§7.1: YAML is a display format only, generated from the
// JSON, never parsed). Pure — no DB, no HTTP — so the server's AI compose response and the frontend's
// Job Detail page render the exact same YAML from the exact same function.
import type { JobConfig } from '../schemas/job-config.schema.ts';

export function jobConfigToYaml(config: JobConfig): string {
  const lines = [`name: ${config.name}`, 'trigger:', `  type: ${config.trigger.type}`];
  if (config.trigger.expr) lines.push(`  expr: "${config.trigger.expr}"`);
  if (config.trigger.tz) lines.push(`  tz: ${config.trigger.tz}`);
  lines.push('task:', `  type: ${config.task.type}`, `timeoutMs: ${config.timeoutMs}`);
  lines.push('retry:', `  attempts: ${config.retry.attempts}`, `  backoff: ${config.retry.backoff}`, `  baseMs: ${config.retry.baseMs}`);
  lines.push('idempotency:', `  key: "${config.idempotency.keyTemplate}"`, `  ttlSeconds: ${config.idempotency.ttlSeconds}`);
  lines.push('alert:', `  afterConsecutiveFailures: ${config.alert.afterConsecutiveFailures}`);
  if (config.alert.channel) lines.push(`  channel: ${config.alert.channel}`);
  return lines.join('\n');
}
