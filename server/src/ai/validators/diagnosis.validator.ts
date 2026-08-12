// Strict validation of Gemini's raw diagnose-failures JSON output against aiDiagnoseResponseSchema
// minus `clusters` (that field is filled in by the service from the deterministic cluster data
// already computed in code — the model never produces it, so it's not part of what's validated
// here). The AI never writes to the database — this only says yes or no with reasons.
import { z } from 'zod';
import { aiDiagnoseFindingSchema, aiDiagnoseFixSchema } from '@flowforge/shared';

const diagnosisModelOutputSchema = z.object({
  summary: z.string().min(1),
  findings: z.array(aiDiagnoseFindingSchema),
  fixes: z.array(aiDiagnoseFixSchema),
});

export type DiagnosisModelOutput = z.infer<typeof diagnosisModelOutputSchema>;
export type DiagnosisValidationResult = { ok: true; output: DiagnosisModelOutput } | { ok: false; issues: string[] };

function formatIssue(path: PropertyKey[], message: string): string {
  const location = path.length > 0 ? path.join('.') : '(root)';
  return `${location}: ${message}`;
}

export function validateDiagnosisOutput(raw: unknown): DiagnosisValidationResult {
  const parsed = diagnosisModelOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => formatIssue(issue.path, issue.message)) };
  }
  return { ok: true, output: parsed.data };
}
