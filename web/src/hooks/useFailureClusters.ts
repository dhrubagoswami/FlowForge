import type { FailureCluster } from '@flowforge/shared';
import { fetchFailureClusters } from '../api/failures.ts';
import { useApiResource, type ApiResourceState } from './useApiResource.ts';

export function useFailureClusters(): ApiResourceState<FailureCluster[]> {
  return useApiResource(fetchFailureClusters, []);
}
