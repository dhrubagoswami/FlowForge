import type { AiComposeFailureResponse, AiComposeResponse } from '@flowforge/shared';
import { apiPostRaw } from './client.ts';

export type ComposeJobResult = { ok: true; data: AiComposeResponse } | { ok: false; data: AiComposeFailureResponse };

export async function composeJob(prompt: string): Promise<ComposeJobResult> {
  const { status, data } = await apiPostRaw<AiComposeResponse | AiComposeFailureResponse>('/api/ai/compose', { prompt });
  return status === 200 ? { ok: true, data: data as AiComposeResponse } : { ok: false, data: data as AiComposeFailureResponse };
}
