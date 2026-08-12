// Parses and validates process.env once. Nothing else in worker/ reads process.env directly.
import { z } from 'zod';

// An unset .env value (e.g. "WORKER_ID=") arrives as an empty string, not undefined — the empty
// string is treated the same as "not provided" so .optional()/.default() behave as expected.
const emptyToUndefined = (val: unknown) => (val === '' ? undefined : val);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  WORKER_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(4),
  EXPECTED_WORKER_FLEET_SIZE: z.coerce.number().int().min(1).default(1),
  HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  SHUTDOWN_GRACE_MS: z.coerce.number().int().min(1000).default(30000),
  LOG_LEVEL: z.string().default('info'),
});

export const env = envSchema.parse(process.env);
