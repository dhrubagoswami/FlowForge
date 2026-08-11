import type { WorkerSummary } from '@flowforge/shared';
import type { WorkerCard } from '../types.ts';
import { formatRelativeToNow } from './format.ts';

function regionFromHostname(hostname: string): string {
  const [region] = hostname.split('-');
  return region || hostname;
}

export function toWorkerCard(worker: WorkerSummary): WorkerCard {
  const pct = Math.round((worker.inflight / worker.concurrency) * 100);
  const saturated = pct > 90;
  return {
    id: worker.id,
    inflight: worker.inflight,
    capacity: worker.concurrency,
    pct: `${pct}%`,
    load: `${pct}%`,
    fill: saturated ? 'var(--color-accent)' : 'var(--color-accent-2-500)',
    state: saturated ? 'saturated' : 'ready',
    tagClass: saturated ? 'tag-accent' : 'tag-accent-2',
    meta: `${regionFromHostname(worker.hostname)} · heartbeat ${formatRelativeToNow(worker.lastHeartbeatAt)}`,
  };
}
