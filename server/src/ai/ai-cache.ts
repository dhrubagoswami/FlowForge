// Caches an AI response by a hash of its normalised input, so the free tier never pays twice for
// the same prompt. §9.2.5 — every Gemini call must be cacheable, kind-scoped (compose vs diagnose).
import { createHash } from 'node:crypto';
import { aiCacheTable, type AiCacheKind } from '@flowforge/shared';
import { and, eq, gt } from 'drizzle-orm';
import { env } from '../config/env.ts';
import { db } from '../db/client.ts';

export function hashAiInput(kind: AiCacheKind, normalisedInput: string): string {
  return createHash('sha256').update(`${kind}:${normalisedInput}`).digest('hex');
}

export async function getCachedAiResponse<T>(inputHash: string): Promise<T | null> {
  const [row] = await db
    .select({ response: aiCacheTable.response })
    .from(aiCacheTable)
    .where(and(eq(aiCacheTable.inputHash, inputHash), gt(aiCacheTable.expiresAt, new Date())))
    .limit(1);
  return row ? (row.response as T) : null;
}

export async function setCachedAiResponse(params: { kind: AiCacheKind; inputHash: string; response: unknown; model: string }): Promise<void> {
  const expiresAt = new Date(Date.now() + env.AI_CACHE_TTL_SECONDS * 1000);
  await db
    .insert(aiCacheTable)
    .values({ kind: params.kind, inputHash: params.inputHash, response: params.response, model: params.model, expiresAt })
    .onConflictDoUpdate({
      target: aiCacheTable.inputHash,
      set: { response: params.response, model: params.model, expiresAt },
    });
}
