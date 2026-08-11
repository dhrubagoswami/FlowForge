// Parses and validates process.env once. Nothing else in server/ reads process.env directly.
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  PORT: z.coerce.number().int().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  AI_CACHE_TTL_SECONDS: z.coerce.number().int().default(3600),
  DEMO_MODE: z.coerce.boolean().default(true),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export const env = envSchema.parse(process.env);
