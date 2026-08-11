// Normalises an error message into a stable fingerprint by stripping numbers, IDs, timestamps,
// and trailing retry/dead-letter framing — so the same underlying fault clusters together
// whether it was caught mid-retry or after the final attempt.
export function fingerprintErrorMessage(message: string): string {
  return message
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/g, '<timestamp>')
    .replace(/#[a-f0-9]{4,}/gi, '#<id>')
    .replace(/\b[a-f0-9]{6,}\b/gi, '<id>')
    // Trailing clauses that describe where in the retry cycle a failure was caught, not the
    // fault itself — e.g. "· attempt 3/3", "· dead-lettered after 3 attempts". These vary by
    // retry position even when the underlying error is identical, so they're stripped before
    // the fault description is used as a clustering key.
    .replace(/\s*·\s*attempt\s+\d+\/\d+/gi, '')
    .replace(/\s*·\s*dead-lettered(\s+after\s+\d+\s+attempts?)?/gi, '')
    .replace(/\d+/g, '<n>')
    .trim();
}
