// §9.4: clustered failures -> a plain-English diagnosis. Clustering itself is deterministic code
// (failure-cluster.service.ts) — only the cluster *summary* is ever sent to Gemini, never raw log
// lines. Three separate steps, three separate files, same shape as ai-composer.service.ts: build
// the prompt, call Gemini, validate, retry once on failure, cache.
import type { AiDiagnoseResponse, FailureCluster } from '@flowforge/shared';
import { getCachedAiResponse, hashAiInput, setCachedAiResponse } from '../ai/ai-cache.ts';
import { generateJson } from '../ai/gemini.client.ts';
import { DIAGNOSE_FAILURES_RESPONSE_SCHEMA, diagnoseFailuresPrompt, diagnoseFailuresRetryPrompt } from '../ai/prompts/diagnose-failures.prompt.ts';
import { validateDiagnosisOutput, type DiagnosisValidationResult } from '../ai/validators/diagnosis.validator.ts';
import { env } from '../config/env.ts';
import { AppError } from '../lib/app-error.ts';
import { getFailureClusters } from './failure-cluster.service.ts';

export type AiDiagnoseFailureResponse = { error: string; validation: { ok: false; issues: string[] } };

// Cached by window + the cluster fingerprint itself (not just windowHours/jobId) — if the
// underlying clusters change between two requests for the same window, that's a materially
// different question and must not hit a stale cache entry.
function clusterFingerprint(clusters: FailureCluster[]): string {
  return clusters
    .map((c) => `${c.errorType}:${c.count}:${c.sampleMessage}`)
    .sort()
    .join('|');
}

async function requestAndValidate(prompt: string): Promise<DiagnosisValidationResult> {
  const raw = await generateJson({ prompt, responseSchema: DIAGNOSE_FAILURES_RESPONSE_SCHEMA });
  const parsed: unknown = JSON.parse(raw);
  return validateDiagnosisOutput(parsed);
}

export async function diagnoseFailures(params: { windowHours?: number; jobId?: string }): Promise<AiDiagnoseResponse | AiDiagnoseFailureResponse> {
  const clusters = await getFailureClusters(params);

  if (clusters.length === 0) {
    return { summary: 'No failures in this window — nothing to diagnose.', findings: [], fixes: [], clusters: [] };
  }

  const inputHash = hashAiInput('diagnose', `${params.windowHours ?? 'default'}:${params.jobId ?? 'all'}:${clusterFingerprint(clusters)}`);

  const cached = await getCachedAiResponse<AiDiagnoseResponse>(inputHash);
  if (cached) return cached;

  let result = await requestAndValidate(diagnoseFailuresPrompt(clusters));
  if (!result.ok) {
    result = await requestAndValidate(diagnoseFailuresRetryPrompt(clusters, result.issues));
  }

  if (!result.ok) {
    return { error: 'Gemini could not produce a valid diagnosis for these failures.', validation: { ok: false, issues: result.issues } };
  }

  const response: AiDiagnoseResponse = { ...result.output, clusters };

  if (!env.GEMINI_MODEL) throw new AppError({ code: 'AI_NOT_CONFIGURED', message: 'GEMINI_MODEL must be set.', statusCode: 503 });
  await setCachedAiResponse({ kind: 'diagnose', inputHash, response, model: env.GEMINI_MODEL });

  return response;
}
