// Builds a run's idempotency key by substituting a job's keyTemplate tokens with real values.
import { createHash } from 'node:crypto';

export interface IdempotencyKeyParams {
  keyTemplate: string;
  jobId: string;
  scheduledAt: Date | null;
  input: unknown;
}

function inputHash(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input ?? null)).digest('hex').slice(0, 16);
}

export function buildIdempotencyKey(params: IdempotencyKeyParams): string {
  const { keyTemplate, jobId, scheduledAt, input } = params;
  return keyTemplate
    .replaceAll('{{job}}', jobId)
    .replaceAll('{{scheduled_at}}', scheduledAt ? scheduledAt.toISOString() : new Date().toISOString())
    .replaceAll('{{input_hash}}', inputHash(input));
}
