// §9.3: plain English -> validated JobConfig. Three separate steps, three separate files — this
// one only orchestrates: build the prompt, call Gemini, validate, retry once on failure, cache.
// It never talks to Fastify and never saves anything; POST /api/jobs is a separate request.
import type { AiComposeFailureResponse, AiComposeResponse } from '@flowforge/shared';
import { jobConfigToYaml } from '@flowforge/shared';
import { getCachedAiResponse, hashAiInput, setCachedAiResponse } from '../ai/ai-cache.ts';
import { generateJson } from '../ai/gemini.client.ts';
import { composeJobPrompt, composeJobRetryPrompt, COMPOSE_JOB_RESPONSE_SCHEMA } from '../ai/prompts/compose-job.prompt.ts';
import { validateComposedJobConfig, type JobConfigValidationResult } from '../ai/validators/job-config.validator.ts';
import { env } from '../config/env.ts';
import { AppError } from '../lib/app-error.ts';

function normalisedInputHash(prompt: string): string {
  const normalised = prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  return hashAiInput('compose', normalised);
}

async function requestAndValidate(prompt: string): Promise<JobConfigValidationResult> {
  const raw = await generateJson({ prompt, responseSchema: COMPOSE_JOB_RESPONSE_SCHEMA });
  const parsed: unknown = JSON.parse(raw);
  return validateComposedJobConfig(parsed);
}

export async function composeJob(userPrompt: string): Promise<AiComposeResponse | AiComposeFailureResponse> {
  const inputHash = normalisedInputHash(userPrompt);

  const cached = await getCachedAiResponse<AiComposeResponse>(inputHash);
  if (cached) return cached;

  let result = await requestAndValidate(composeJobPrompt(userPrompt));
  if (!result.ok) {
    result = await requestAndValidate(composeJobRetryPrompt(userPrompt, result.issues));
  }

  if (!result.ok) {
    return { error: 'Gemini could not produce a valid job config for this prompt.', validation: { ok: false, issues: result.issues } };
  }

  const response: AiComposeResponse = { config: result.config, yaml: jobConfigToYaml(result.config), validation: { ok: true } };

  if (!env.GEMINI_MODEL) throw new AppError({ code: 'AI_NOT_CONFIGURED', message: 'GEMINI_MODEL must be set.', statusCode: 503 });
  await setCachedAiResponse({ kind: 'compose', inputHash, response, model: env.GEMINI_MODEL });

  return response;
}
