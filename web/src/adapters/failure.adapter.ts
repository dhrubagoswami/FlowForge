import type { FailureCluster } from '@flowforge/shared';

export interface ClusterRow {
  title: string;
  sample: string;
  count: number;
  pct: string;
}

/** errorType (e.g. "rate_limit") doubles as the cluster's display title until AI summarization (M9/M10) gives it a real title. */
export function toClusterRows(clusters: FailureCluster[]): ClusterRow[] {
  const max = Math.max(1, ...clusters.map((c) => c.count));
  return clusters.map((c) => ({
    title: c.errorType.replace(/_/g, ' '),
    sample: c.sampleMessage,
    count: c.count,
    pct: `${Math.round((c.count / max) * 100)}%`,
  }));
}
