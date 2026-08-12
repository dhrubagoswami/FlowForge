export type Page = 'overview' | 'jobs' | 'job' | 'composer' | 'failures' | 'workers';
export type FailuresWindowHours = 24 | 168 | 720;
export type Theme = 'light' | 'dark';
export type Viewport = 'desktop' | 'mobile';

export type JobStatus = 'healthy' | 'degraded' | 'failing' | 'paused';
export type Trigger = 'cron' | 'webhook';
export type LogLevel = 'info' | 'ok' | 'warn' | 'error';

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

export interface LogLine {
  t: string;
  level: LogLevel;
  msg: string;
  color: string;
}

export interface JobRow extends Job {
  tagClass: string;
  pct: string;
  fill: string;
  open?: () => void;
}

export interface WorkerLoadBar {
  id: string;
  pct: string;
  load: string;
  fill: string;
}

export interface WorkerCard {
  id: string;
  inflight: number;
  capacity: number;
  pct: string;
  load: string;
  fill: string;
  state: 'saturated' | 'ready';
  tagClass: string;
  status: 'online' | 'draining' | 'offline';
  statusTagClass: string;
  meta: string;
}

export interface RunRow {
  id: string;
  job?: string;
  trigger?: string;
  started?: string;
  attempts: string;
  worker: string;
  duration: string;
  status: string;
  tagClass: string;
  open?: () => void;
}

export interface JobDetailData extends Job {
  tagClass: string;
  yaml: string;
}
