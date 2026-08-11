// http.fetch_json — GET a JSON endpoint, optionally assert a value at a dot-separated JSONPath.
import type { TaskInputFor } from '@flowforge/shared';
import type { TaskLogger } from '../lib/task-logger.ts';

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

export async function runHttpFetchJson(input: TaskInputFor<'http.fetch_json'>, log: TaskLogger): Promise<Record<string, unknown>> {
  await log('info', `GET ${input.url} (json)`);

  const response = await fetch(input.url, { headers: input.headers });
  if (!response.ok) {
    const message = `request failed with status ${response.status}`;
    await log('error', message);
    throw new Error(message);
  }

  const body: unknown = await response.json();

  if (input.assertPath) {
    const actual = readPath(body, input.assertPath);
    if (JSON.stringify(actual) !== JSON.stringify(input.assertEquals)) {
      const message = `assertion failed at "${input.assertPath}": expected ${JSON.stringify(input.assertEquals)}, got ${JSON.stringify(actual)}`;
      await log('error', message);
      throw new Error(message);
    }
  }

  await log('ok', `${input.url} returned valid JSON`);
  return { body };
}
