import type { Job, JobStatus, LogLevel } from './data/mockData';

export type Page = 'overview' | 'jobs' | 'job' | 'composer' | 'failures' | 'workers';
export type Theme = 'light' | 'dark';
export type Viewport = 'desktop' | 'mobile';

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

export interface WorkerCard {
  id: string;
  inflight: number;
  capacity: number;
  pct: string;
  load: string;
  fill: string;
  state: 'saturated' | 'ready';
  tagClass: string;
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

export type { Job, JobStatus };
