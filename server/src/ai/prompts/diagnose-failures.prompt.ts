// The prompt (and its matching JSON response schema) for turning already-clustered failure data
// into a plain-English diagnosis. Clustering itself happens in code (failure-cluster.service.ts) —
// this prompt only ever receives cluster summaries, never raw log lines. No inline prompt strings
// live anywhere else — ai-diagnosis.service.ts only calls this.
import type { FailureCluster } from '@flowforge/shared';

export const DIAGNOSE_FAILURES_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '2-3 plain-English sentences summarising what is going wrong' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'detail', 'severity'],
      },
    },
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          rationale: { type: 'string' },
          confidence: { type: 'number', description: '0-1' },
        },
        required: ['title', 'rationale', 'confidence'],
      },
    },
  },
  required: ['summary', 'findings', 'fixes'],
};

function formatClusters(clusters: FailureCluster[]): string {
  return clusters
    .map((c, i) => `${i + 1}. errorType="${c.errorType}" · ${c.count} occurrences · affects job(s): ${c.jobIds.join(', ')}\n   sample: ${c.sampleMessage}`)
    .join('\n');
}

export function diagnoseFailuresPrompt(clusters: FailureCluster[]): string {
  return `You are looking at clustered failure data from FlowForge, a background job control room. Each cluster below is a group of failed/dead-lettered runs sharing the same error type and a normalised error message. You are NOT seeing raw log lines — only these cluster summaries.

Clusters (${clusters.length} total):
${formatClusters(clusters)}

Write:
- summary: 2-3 plain-English sentences a non-engineer could understand, describing what is going wrong overall.
- findings: one entry per notable cluster (or group of related clusters), each with a short title, a one/two-sentence detail, and a severity (high/medium/low) based on occurrence count and how disruptive the error type sounds.
- fixes: ranked, advisory-only suggestions (this is Phase 2 — nothing is applied automatically). Each fix needs a title, a rationale grounded in the clusters above, and a confidence 0-1. Never suggest a fix that requires information not present in the clusters.

Never invent an error type, job id, or count that isn't in the cluster data above.`;
}

export function diagnoseFailuresRetryPrompt(clusters: FailureCluster[], previousIssues: string[]): string {
  return `${diagnoseFailuresPrompt(clusters)}

Your previous attempt was invalid. Fix these problems and return a corrected response:
${previousIssues.map((issue) => `- ${issue}`).join('\n')}`;
}
