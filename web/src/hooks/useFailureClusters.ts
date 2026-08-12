import { useCallback } from 'react';
import type { FailureCluster } from '@flowforge/shared';
import { fetchFailureClusters } from '../api/failures.ts';
import { useApiResource, type ApiResourceState } from './useApiResource.ts';

export function useFailureClusters(windowHours: number): ApiResourceState<FailureCluster[]> {
  const fetcher = useCallback(() => fetchFailureClusters({ windowHours }), [windowHours]);
  return useApiResource(fetcher, [windowHours]);
}
