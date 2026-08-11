import type { StatsOverview } from '@flowforge/shared';
import type { WorkerCard } from '../types.ts';

export interface Bar {
  x: number;
  y: number;
  h: number;
  fill: string;
}

/** Turns the 24 hourly (succeeded, failed) buckets into the paired enqueued/drained bar pairs the Overview chart already draws. */
export function toActivityBars(activity: StatsOverview['activity']): Bar[] {
  const counts = activity.map((a) => a.succeeded + a.failed);
  const max = Math.max(1, ...counts);
  const bars: Bar[] = [];
  activity.forEach((a, i) => {
    const total = a.succeeded + a.failed;
    const upH = (total / max) * 56;
    const dnH = (a.succeeded / max) * 44;
    bars.push({ x: i * 23 + 4, y: 65 - upH * 0.72, h: upH * 0.72, fill: 'var(--color-accent-400)' });
    bars.push({ x: i * 23 + 4, y: 68, h: dnH * 0.62, fill: 'var(--color-accent-2-500)' });
  });
  return bars;
}

export interface StatCard {
  label: string;
  value: string;
  note: string;
}

/** Sum of the 24 hourly "failed" buckets (failed + dead_letter statuses) — the closest real number to the old mock's "N dead-lettered" note. */
function failedLast24h(overview: StatsOverview): number {
  return overview.activity.reduce((sum, a) => sum + a.failed, 0);
}

export function toStatCards(overview: StatsOverview): StatCard[] {
  const failed = failedLast24h(overview);
  return [
    { label: 'Runs · 24h', value: overview.runsLast24h.toLocaleString(), note: `${failed} dead-lettered` },
    { label: 'Success rate', value: `${overview.successRatePct.toFixed(1)}%`, note: `${failed} dead-lettered` },
    { label: 'Queue depth', value: String(overview.queueDepth), note: 'live from worker fleet' },
    { label: 'p95 latency', value: `${(overview.p95WaitMs / 1000).toFixed(1)}s`, note: 'enqueue → ack' },
  ];
}

/** The Overview page's "worker fleet" bars only need id/inflight/concurrency — a lighter shape than the full worker.adapter's WorkerCard, which needs hostname/heartbeat data the top-workers query doesn't return. */
export function toOverviewWorkerBars(topWorkers: StatsOverview['topWorkers']): WorkerCard[] {
  return topWorkers.map((w) => {
    const pct = Math.round((w.inflight / w.concurrency) * 100);
    const saturated = pct > 90;
    return {
      id: w.id,
      inflight: w.inflight,
      capacity: w.concurrency,
      pct: `${pct}%`,
      load: `${pct}%`,
      fill: saturated ? 'var(--color-accent)' : 'var(--color-accent-2-500)',
      state: saturated ? 'saturated' : 'ready',
      tagClass: saturated ? 'tag-accent' : 'tag-accent-2',
      meta: '',
    };
  });
}

export function toMobileStatCards(overview: StatsOverview): StatCard[] {
  const failed = failedLast24h(overview);
  return [
    { label: 'Runs · 24h', value: overview.runsLast24h.toLocaleString(), note: `${failed} dead-lettered` },
    { label: 'Success', value: `${overview.successRatePct.toFixed(1)}%`, note: `${failed} dead-lettered` },
  ];
}
