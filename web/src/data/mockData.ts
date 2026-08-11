export type JobStatus = 'healthy' | 'degraded' | 'failing' | 'paused';
export type Trigger = 'cron' | 'webhook';

export interface Job {
  id: string;
  name: string;
  trigger: Trigger;
  schedLabel: string;
  status: JobStatus;
  rate: number;
  last: string;
  avg: string;
  next: string;
}

export const JOBS: Job[] = [
  { id: 'pricing', name: 'competitor-pricing-scrape', trigger: 'cron', schedLabel: 'Daily 09:00 UTC', status: 'healthy', rate: 99.4, last: '2m ago', avg: '12.4s', next: '3h 12m' },
  { id: 'backup', name: 'postgres-nightly-backup', trigger: 'cron', schedLabel: 'Daily 02:00 UTC', status: 'healthy', rate: 100, last: '7h ago', avg: '3m 41s', next: '10h 08m' },
  { id: 'stripe', name: 'stripe-webhook-reconcile', trigger: 'webhook', schedLabel: 'On delivery', status: 'degraded', rate: 96.1, last: '18s ago', avg: '840ms', next: 'on event' },
  { id: 'embed', name: 'docs-embedding-index', trigger: 'cron', schedLabel: 'Every 30 min', status: 'failing', rate: 71.8, last: '4m ago', avg: '48.2s', next: '26m' },
  { id: 'digest', name: 'slack-weekly-digest', trigger: 'cron', schedLabel: 'Mon 15:00 UTC', status: 'healthy', rate: 100, last: '2d ago', avg: '6.1s', next: '4d 2h' },
  { id: 'retrain', name: 'churn-model-retrain', trigger: 'cron', schedLabel: 'Sun 04:00 UTC', status: 'paused', rate: 98.2, last: '5d ago', avg: '22m 03s', next: 'paused' },
];

export const TAGS: Record<JobStatus | 'succeeded' | 'failed' | 'retrying', string> = {
  healthy: 'tag-accent-2',
  degraded: 'tag-outline',
  failing: 'tag-accent',
  paused: 'tag-neutral',
  succeeded: 'tag-accent-2',
  failed: 'tag-accent',
  retrying: 'tag-outline',
};

export const YAML: Record<string, string> = {
  pricing: `name: competitor-pricing-scrape
trigger:
  type: cron
  expr: "0 9 * * *"
  tz: UTC
run:
  image: flowforge/scraper:1.4
  timeout: 120s
retry:
  attempts: 3
  backoff: exponential
  base: 30s
idempotency:
  key: "{{job}}:{{scheduled_at}}"
  ttl: 24h
alert:
  after_consecutive_failures: 3
  channel: slack#ops`,
  embed: `name: docs-embedding-index
trigger:
  type: cron
  expr: "*/30 * * * *"
run:
  image: flowforge/embedder:2.1
  timeout: 300s
retry:
  attempts: 3
  backoff: exponential
  base: 15s
idempotency:
  key: "docs:{{content_hash}}"
  ttl: 7d
alert:
  after_consecutive_failures: 2`,
};

export type LogLevel = 'info' | 'ok' | 'warn' | 'error';

export const LOG_POOL: [LogLevel, string][] = [
  ['info', 'worker-03 claimed job pricing#8f21c4 (attempt 1/3)'],
  ['info', 'lock acquired · idempotency key pricing:2026-07-27T09:00Z'],
  ['ok', 'fetched 42 product rows in 8.9s'],
  ['info', 'diffing against previous snapshot rev 1841'],
  ['warn', 'selector .price-now matched 0 nodes — falling back'],
  ['ok', 'snapshot 1842 written · 3 price changes'],
  ['info', 'ack → queue depth 36'],
  ['error', 'upstream 429 Too Many Requests · retry in 30s'],
  ['info', 'requeued with backoff · attempt 2/3'],
  ['ok', 'run 8f21c4 completed in 12.1s'],
  ['info', 'heartbeat worker-05 · 3/4 slots busy'],
  ['ok', 'webhook stripe.invoice.paid processed · 214ms'],
];

export const RAW = `2026-07-27T04:12:08Z ERROR embed  provider 429 Too Many Requests (req 8c21)
2026-07-27T04:12:38Z ERROR embed  attempt 2/3 failed · 429
2026-07-27T04:13:24Z ERROR embed  attempt 3/3 failed · 429 · dead-lettered
2026-07-27T04:42:11Z ERROR embed  provider 429 Too Many Requests (req 8c44)
2026-07-27T04:51:02Z WARN  stripe webhook replay detected · idempotency hit, skipped
2026-07-27T05:09:47Z ERROR embed  context deadline exceeded after 300s
2026-07-27T05:14:19Z ERROR pricing selector .price-now matched 0 nodes
2026-07-27T05:22:55Z ERROR embed  provider 429 Too Many Requests (req 8d02)`;

export const LEVEL_COLOR: Record<LogLevel, string> = {
  info: '#8f8878',
  ok: '#aebf92',
  warn: '#f6a06b',
  error: '#e08a6a',
};

export const RUN_IDS = ['8f21c4', '7ad093', '61be2f', '55c7a1', '4e0d38', '3b9f77', '2c41ab', '1d8e05'];

export const FINDINGS = [
  'docs-embedding-index: 312 of 468 failures, all HTTP 429 from the embedding provider, clustered 04:00–05:00 UTC when the nightly re-index and the half-hourly job overlap.',
  'All three retries land inside the same 60-second rate-limit window, so the backoff never actually helps — 3 attempts cost 3 quota slots and still dead-letter.',
  'stripe-webhook-reconcile shows 41 duplicate deliveries, all correctly skipped by the idempotency key — noise, not a defect.',
];

export const CLUSTERS = [
  { title: 'Provider rate limit (429)', sample: 'provider 429 Too Many Requests (req 8c21)', count: 312, pct: '100%' },
  { title: 'Context deadline exceeded', sample: 'context deadline exceeded after 300s', count: 74, pct: '24%' },
  { title: 'Selector drift on scrape', sample: 'selector .price-now matched 0 nodes', count: 38, pct: '12%' },
  { title: 'Duplicate webhook delivery', sample: 'idempotency hit, skipped', count: 41, pct: '13%' },
];

export const FIXES = [
  { n: '01', title: 'Raise retry base to 5 minutes', detail: 'Moves attempt 2 and 3 out of the rate-limit window instead of burning them inside it.' },
  { n: '02', title: 'Cap concurrency to 2 for docs-embedding-index', detail: 'Per-job concurrency key on the queue keeps the two schedules from overlapping.' },
  { n: '03', title: 'Split the nightly re-index to 03:15 UTC', detail: 'Removes the 04:00 collision entirely; expected failure drop ≈ 66%.' },
];

export const GUARANTEES = [
  { k: 'Idempotency key', v: 'job:scheduled_at' },
  { k: 'Key TTL', v: '24h (Redis SETNX)' },
  { k: 'Retry policy', v: '3 × exponential, base 30s' },
  { k: 'Dead letter', v: 'flowforge:dlq · 4 waiting' },
  { k: 'Visibility timeout', v: '120s' },
];

export const EXAMPLE_PROMPTS = [
  { label: 'Nightly DB backup', text: 'Back up the primary Postgres to S3 every night at 2am, keep 30 days, page me if it fails twice.' },
  { label: 'Webhook reconcile', text: 'On every Stripe invoice webhook, reconcile the invoice against our ledger; skip duplicates by event id.' },
  { label: 'Re-index docs', text: 'Re-embed changed docs every 30 minutes, but never more than 200 requests per minute.' },
];

export function clock(d: Date) {
  return d.toTimeString().slice(0, 8);
}
