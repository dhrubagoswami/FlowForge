// Aggregate queries for the Overview stats — every number computed in SQL, never by pulling rows into Node and reducing them.
import { SUCCESS_RATE_COUNTED_STATUSES, SUCCESS_RATE_SUCCESS_STATUSES } from '@flowforge/shared';
import { and, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client.ts';
import { runsTable, workersTable } from '../db/schema/index.ts';

export interface RunCountsSince {
  /** True count of every run in the window, regardless of status — a volume metric, not a success-rate input. */
  total: number;
  /** Denominator for the success rate: runs whose outcome has settled (excludes skipped_duplicate, queued, running, retrying). */
  ratedTotal: number;
  /** Numerator for the success rate: settled runs that succeeded. */
  succeeded: number;
}

export async function countRunsSince(since: Date): Promise<RunCountsSince> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      ratedTotal: sql<number>`count(*) filter (where ${inArray(runsTable.status, SUCCESS_RATE_COUNTED_STATUSES)})`.mapWith(Number),
      succeeded: sql<number>`count(*) filter (where ${inArray(runsTable.status, SUCCESS_RATE_SUCCESS_STATUSES)})`.mapWith(Number),
    })
    .from(runsTable)
    .where(gte(runsTable.queuedAt, since));

  return row ?? { total: 0, ratedTotal: 0, succeeded: 0 };
}

export async function p95WaitMsSince(since: Date): Promise<number> {
  const [row] = await db
    .select({
      p95: sql<number | null>`percentile_cont(0.95) within group (order by ${runsTable.waitMs})`.mapWith(Number),
    })
    .from(runsTable)
    .where(and(gte(runsTable.queuedAt, since), sql`${runsTable.waitMs} is not null`));

  return row?.p95 ?? 0;
}

export interface ActivityBucket {
  hour: string;
  succeeded: number;
  failed: number;
}

/**
 * One row per hour bucket over the last N hours, succeeded/failed counts computed in SQL via a
 * filtered count + generate_series so empty hours still appear. generate_series is inclusive on
 * both ends, so the series is built from (now - N hours) up to but excluding the current hour's
 * start, giving exactly N complete trailing hours ending at the most recent one.
 */
export async function activityBucketsSince(since: Date, hours: number): Promise<ActivityBucket[]> {
  const rows = await db.execute<{ hour: Date; succeeded: number; failed: number }>(sql`
    select
      bucket.hour as hour,
      count(${runsTable.id}) filter (where ${runsTable.status} = 'succeeded') as succeeded,
      count(${runsTable.id}) filter (where ${runsTable.status} in ('failed', 'dead_letter')) as failed
    from generate_series(
      date_trunc('hour', now()) - (${hours}::int - 1) * interval '1 hour',
      date_trunc('hour', now()),
      interval '1 hour'
    ) as bucket(hour)
    left join ${runsTable} on date_trunc('hour', ${runsTable.queuedAt}) = bucket.hour
    where bucket.hour >= date_trunc('hour', ${since.toISOString()}::timestamptz)
    group by bucket.hour
    order by bucket.hour
  `);

  return rows.map((r) => ({ hour: new Date(r.hour).toISOString(), succeeded: Number(r.succeeded), failed: Number(r.failed) }));
}

export interface TopWorkerRow {
  id: string;
  inflight: number;
  concurrency: number;
}

export async function topWorkersByInflight(limit: number): Promise<TopWorkerRow[]> {
  return db
    .select({ id: workersTable.id, inflight: workersTable.inflight, concurrency: workersTable.concurrency })
    .from(workersTable)
    .orderBy(sql`${workersTable.inflight} desc`)
    .limit(limit);
}
