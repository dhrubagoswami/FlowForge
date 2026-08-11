import { describe, expect, it } from 'vitest';
import { getTaskInputSchema, TASK_INPUT_SCHEMAS } from './task-input.schema.ts';

describe('task-input schemas', () => {
  it('has one schema per task type', () => {
    expect(Object.keys(TASK_INPUT_SCHEMAS).sort()).toEqual(
      ['db.snapshot', 'http.check', 'http.fetch_json', 'notify.webhook', 'report.generate', 'simulate'].sort(),
    );
  });

  it('validates a correct http.check input', () => {
    const schema = getTaskInputSchema('http.check');
    const result = schema.safeParse({ url: 'https://example.com', expectStatus: 200 });
    expect(result.success).toBe(true);
  });

  it('rejects an http.check input missing url', () => {
    const schema = getTaskInputSchema('http.check');
    const result = schema.safeParse({ expectStatus: 200 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown fields on a strict schema', () => {
    const schema = getTaskInputSchema('db.snapshot');
    const result = schema.safeParse({ table: 'runs', extraField: 'nope' });
    expect(result.success).toBe(false);
  });

  it('validates a correct simulate input with failureMode', () => {
    const schema = getTaskInputSchema('simulate');
    const result = schema.safeParse({ durationMs: 2000, failureMode: 'rate_limit' });
    expect(result.success).toBe(true);
  });

  it('rejects a simulate input with an invalid failureMode', () => {
    const schema = getTaskInputSchema('simulate');
    const result = schema.safeParse({ durationMs: 2000, failureMode: 'sabotage' });
    expect(result.success).toBe(false);
  });
});
