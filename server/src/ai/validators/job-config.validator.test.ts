// §15: the AI validator rejects hallucinated task types, invalid crons, and out-of-bounds numbers.
// No Gemini call here — this tests the validator against raw parsed JSON directly.
import { describe, expect, it } from 'vitest';
import { validateComposedJobConfig } from './job-config.validator.ts';

function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    name: 'nightly-backup',
    trigger: { type: 'cron', expr: '0 2 * * *', tz: 'UTC' },
    task: { type: 'simulate', input: { durationMs: 1000 } },
    timeoutMs: 120000,
    retry: { attempts: 3, backoff: 'exponential', baseMs: 30000 },
    idempotency: { keyTemplate: '{{job}}:{{scheduled_at}}', ttlSeconds: 86400 },
    alert: { afterConsecutiveFailures: 3 },
    ...overrides,
  };
}

describe('validateComposedJobConfig', () => {
  it('accepts a well-formed config', () => {
    const result = validateComposedJobConfig(validConfig());
    expect(result.ok).toBe(true);
  });

  it('rejects a hallucinated task type not in the fixed menu', () => {
    const result = validateComposedJobConfig(validConfig({ task: { type: 'scrape.arbitrary_url', input: {} } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes('task.type'))).toBe(true);
  });

  it('rejects an invalid cron expression', () => {
    const result = validateComposedJobConfig(validConfig({ trigger: { type: 'cron', expr: 'not a cron', tz: 'UTC' } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.includes('not a valid 5-field cron'))).toBe(true);
  });

  it('rejects a cron trigger missing expr', () => {
    const result = validateComposedJobConfig(validConfig({ trigger: { type: 'cron', tz: 'UTC' } }));
    expect(result.ok).toBe(false);
  });

  it('rejects retry.attempts above the bound (max 10)', () => {
    const result = validateComposedJobConfig(validConfig({ retry: { attempts: 25, backoff: 'exponential', baseMs: 30000 } }));
    expect(result.ok).toBe(false);
  });

  it('rejects timeoutMs above the bound (max 900000)', () => {
    const result = validateComposedJobConfig(validConfig({ timeoutMs: 5_000_000 }));
    expect(result.ok).toBe(false);
  });

  it('rejects an idempotency keyTemplate using an unknown token', () => {
    const result = validateComposedJobConfig(validConfig({ idempotency: { keyTemplate: '{{job}}:{{made_up_token}}', ttlSeconds: 3600 } }));
    expect(result.ok).toBe(false);
  });

  it('rejects task.input that fails that task type\'s own schema', () => {
    // simulate requires durationMs; this omits it and adds an unknown field (strictObject).
    const result = validateComposedJobConfig(validConfig({ task: { type: 'simulate', input: { madeUpField: true } } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((i) => i.startsWith('task.input'))).toBe(true);
  });

  it('rejects a non-slug name', () => {
    const result = validateComposedJobConfig(validConfig({ name: 'Not A Slug!' }));
    expect(result.ok).toBe(false);
  });

  // Found live against the real Gemini API: the structured-output schema offers every task type's
  // field names in one flat object (JSON Schema can't easily make task.input conditional on
  // task.type), so the model sometimes includes a stray field from a different task type alongside
  // otherwise-correct output — e.g. http.check with report.generate's windowHours. The strict
  // per-field schema below must still fail loudly on anything actually wrong for the chosen type.
  it('strips a field from a different task type but still requires that type\'s own required fields', () => {
    const accepted = validateComposedJobConfig(
      validConfig({ task: { type: 'http.check', input: { url: 'https://example.com', windowHours: 24 } } }),
    );
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.config.task.input).toEqual({ url: 'https://example.com' });

    const stillRejected = validateComposedJobConfig(validConfig({ task: { type: 'http.check', input: { windowHours: 24 } } }));
    expect(stillRejected.ok).toBe(false);
  });
});
