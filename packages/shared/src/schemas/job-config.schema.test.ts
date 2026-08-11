import { describe, expect, it } from 'vitest';
import { jobConfigSchema } from './job-config.schema.ts';

function validConfig() {
  return {
    name: 'competitor-pricing-scrape',
    trigger: { type: 'cron', expr: '0 9 * * *', tz: 'UTC' },
    task: { type: 'http.check', input: { url: 'https://example.com' } },
    timeoutMs: 120000,
    retry: { attempts: 3, backoff: 'exponential', baseMs: 30000 },
    idempotency: { keyTemplate: '{{job}}:{{scheduled_at}}', ttlSeconds: 86400 },
    alert: { afterConsecutiveFailures: 3, channel: 'slack#ops' },
  };
}

describe('jobConfigSchema', () => {
  it('accepts a valid config', () => {
    const result = jobConfigSchema.safeParse(validConfig());
    expect(result.success).toBe(true);
  });

  it('rejects a non-kebab-case name', () => {
    const result = jobConfigSchema.safeParse({ ...validConfig(), name: 'Competitor Pricing Scrape' });
    expect(result.success).toBe(false);
  });

  it('requires expr when trigger.type is cron', () => {
    const config = validConfig();
    // @ts-expect-error deliberately omitting expr to test the refinement
    delete config.trigger.expr;
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid cron expression', () => {
    const config = validConfig();
    config.trigger.expr = 'not a cron';
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('accepts a webhook trigger with no expr', () => {
    const config = validConfig();
    config.trigger = { type: 'webhook', tz: 'UTC' } as typeof config.trigger;
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects retry.attempts out of bounds', () => {
    const config = validConfig();
    config.retry.attempts = 11;
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects timeoutMs out of bounds', () => {
    const config = validConfig();
    config.timeoutMs = 999;
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects idempotency.ttlSeconds out of bounds', () => {
    const config = validConfig();
    config.idempotency.ttlSeconds = 30;
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects alert.afterConsecutiveFailures out of bounds', () => {
    const config = validConfig();
    config.alert.afterConsecutiveFailures = 21;
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects an idempotency keyTemplate with an unknown token', () => {
    const config = validConfig();
    config.idempotency.keyTemplate = '{{job}}:{{secret_key}}';
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('accepts all three known idempotency template tokens', () => {
    const config = validConfig();
    config.idempotency.keyTemplate = '{{job}}:{{scheduled_at}}:{{input_hash}}';
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown task type', () => {
    const config = validConfig();
    config.task = { type: 'shell.exec', input: {} } as typeof config.task;
    const result = jobConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});
