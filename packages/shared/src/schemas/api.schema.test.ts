import { describe, expect, it } from 'vitest';
import { updateJobRequestSchema } from './api.schema.ts';

describe('updateJobRequestSchema', () => {
  it('accepts an empty patch (no fields changed)', () => {
    expect(updateJobRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a patch touching only one top-level field', () => {
    expect(updateJobRequestSchema.safeParse({ description: 'new description' }).success).toBe(true);
  });

  it('accepts a patch touching only one field of a nested object, without the object\'s other fields', () => {
    const result = updateJobRequestSchema.safeParse({ retry: { baseMs: 90000 } });
    expect(result.success).toBe(true);
  });

  it('accepts a patch touching only trigger.tz without trigger.type or trigger.expr', () => {
    expect(updateJobRequestSchema.safeParse({ trigger: { tz: 'America/New_York' } }).success).toBe(true);
  });

  it('rejects an unknown top-level key', () => {
    const result = updateJobRequestSchema.safeParse({ notARealField: true });
    expect(result.success).toBe(false);
  });

  it('rejects name — a job\'s id/slug is not something PATCH changes', () => {
    const result = updateJobRequestSchema.safeParse({ name: 'new-slug' });
    expect(result.success).toBe(false);
  });

  it('still enforces field-level constraints on whatever is provided (e.g. timeoutMs bounds)', () => {
    const result = updateJobRequestSchema.safeParse({ timeoutMs: 999999999 });
    expect(result.success).toBe(false);
  });
});
