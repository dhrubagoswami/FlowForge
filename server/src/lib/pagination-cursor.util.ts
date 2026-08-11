// Encodes/decodes the opaque keyset-pagination cursor used by run-listing endpoints: base64 of "<queuedAt ISO>|<id>".
export interface RunCursor {
  queuedAt: Date;
  id: string;
}

export function encodeRunCursor(cursor: RunCursor): string {
  const raw = `${cursor.queuedAt.toISOString()}|${cursor.id}`;
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeRunCursor(encoded: string): RunCursor | null {
  let raw: string;
  try {
    raw = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const separatorIndex = raw.indexOf('|');
  if (separatorIndex === -1) return null;

  const isoTimestamp = raw.slice(0, separatorIndex);
  const id = raw.slice(separatorIndex + 1);
  if (!id) return null;

  const queuedAt = new Date(isoTimestamp);
  if (Number.isNaN(queuedAt.getTime())) return null;

  return { queuedAt, id };
}
