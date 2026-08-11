import type { WorkerSummary } from '@flowforge/shared';
import { fetchWorkers } from '../api/workers.ts';
import { useApiResource, type ApiResourceState } from './useApiResource.ts';

export function useWorkers(): ApiResourceState<WorkerSummary[]> {
  return useApiResource(fetchWorkers, []);
}
