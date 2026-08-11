import type { WorkerSummary } from '@flowforge/shared';
import { apiGet } from './client.ts';

export function fetchWorkers(): Promise<WorkerSummary[]> {
  return apiGet('/api/workers');
}
