// Maps real API status/health enums to the existing tag-color classes from tokens.css.
import type { JobHealth, RunStatus } from '@flowforge/shared';

export const HEALTH_TAG_CLASS: Record<JobHealth, string> = {
  healthy: 'tag-accent-2',
  degraded: 'tag-outline',
  failing: 'tag-accent',
  paused: 'tag-neutral',
};

export const RUN_STATUS_TAG_CLASS: Record<RunStatus, string> = {
  queued: 'tag-neutral',
  running: 'tag-outline',
  succeeded: 'tag-accent-2',
  failed: 'tag-accent',
  retrying: 'tag-outline',
  dead_letter: 'tag-accent',
  cancelled: 'tag-neutral',
  skipped_duplicate: 'tag-neutral',
};
