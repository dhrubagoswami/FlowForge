// The ai_cache table — caches Gemini responses by a hash of the normalised input, so the free tier never pays twice for the same prompt.
import { AI_CACHE_KINDS } from '@flowforge/shared';
import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const aiCacheKindEnum = pgEnum('ai_cache_kind', AI_CACHE_KINDS);

export const aiCacheTable = pgTable('ai_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: aiCacheKindEnum('kind').notNull(),
  inputHash: text('input_hash').notNull().unique(),
  response: jsonb('response').notNull(),
  model: text('model').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
