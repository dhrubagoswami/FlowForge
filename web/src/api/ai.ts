import type { AiComposeFailureResponse, AiComposeResponse, AiDiagnoseResponse } from '@flowforge/shared';
import { apiPostRaw } from './client.ts';

export type ComposeJobResult = { ok: true; data: AiComposeResponse } | { ok: false; data: AiComposeFailureResponse };

export async function composeJob(prompt: string): Promise<ComposeJobResult> {
  const { status, data } = await apiPostRaw<AiComposeResponse | AiComposeFailureResponse>('/api/ai/compose', { prompt });
  return status === 200 ? { ok: true, data: data as AiComposeResponse } : { ok: false, data: data as AiComposeFailureResponse };
}

export type DiagnoseFailuresResult = { ok: true; data: AiDiagnoseResponse } | { ok: false; data: { error: string; validation: { ok: false; issues: string[] } } };

export async function diagnoseFailures(params?: { windowHours?: number; jobId?: string }): Promise<DiagnoseFailuresResult> {
  const { status, data } = await apiPostRaw<AiDiagnoseResponse | { error: string; validation: { ok: false; issues: string[] } }>('/api/ai/diagnose', params ?? {});
  return status === 200 ? { ok: true, data: data as AiDiagnoseResponse } : { ok: false, data: data as { error: string; validation: { ok: false; issues: string[] } } };
}
