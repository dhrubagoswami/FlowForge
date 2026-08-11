import { describe, expect, it } from 'vitest';
import { buildIdempotencyKey } from './idempotency-key.util.ts';

describe('buildIdempotencyKey', () => {
  it('substitutes {{job}} with the job id', () => {
    const key = buildIdempotencyKey({ keyTemplate: '{{job}}:fixed', jobId: 'competitor-pricing-scrape', scheduledAt: null, input: {} });
    expect(key).toBe('competitor-pricing-scrape:fixed');
  });

  it('substitutes {{scheduled_at}} with the scheduled time as ISO', () => {
    const scheduledAt = new Date('2026-08-11T09:00:00.000Z');
    const key = buildIdempotencyKey({ keyTemplate: '{{job}}:{{scheduled_at}}', jobId: 'pricing', scheduledAt, input: {} });
    expect(key).toBe('pricing:2026-08-11T09:00:00.000Z');
  });

  it('substitutes {{input_hash}} deterministically for the same input', () => {
    const params = { keyTemplate: '{{job}}:{{input_hash}}', jobId: 'stripe', scheduledAt: null, input: { a: 1, b: 2 } };
    const first = buildIdempotencyKey(params);
    const second = buildIdempotencyKey(params);
    expect(first).toBe(second);
  });

  it('produces different hashes for different input', () => {
    const keyA = buildIdempotencyKey({ keyTemplate: '{{input_hash}}', jobId: 'stripe', scheduledAt: null, input: { a: 1 } });
    const keyB = buildIdempotencyKey({ keyTemplate: '{{input_hash}}', jobId: 'stripe', scheduledAt: null, input: { a: 2 } });
    expect(keyA).not.toBe(keyB);
  });

  it('handles a template with multiple tokens', () => {
    const scheduledAt = new Date('2026-01-01T00:00:00.000Z');
    const key = buildIdempotencyKey({ keyTemplate: '{{job}}:{{scheduled_at}}:{{input_hash}}', jobId: 'x', scheduledAt, input: 'y' });
    expect(key.startsWith('x:2026-01-01T00:00:00.000Z:')).toBe(true);
  });
});
