// http.check — GET a URL, assert the status code and (optionally) that the body contains a string.
import type { TaskInputFor } from '@flowforge/shared';
import type { TaskLogger } from '../lib/task-logger.ts';

export async function runHttpCheck(input: TaskInputFor<'http.check'>, log: TaskLogger): Promise<Record<string, unknown>> {
  await log('info', `GET ${input.url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 30000);
  let response: Response;
  try {
    response = await fetch(input.url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  const expectStatus = input.expectStatus ?? 200;
  if (response.status !== expectStatus) {
    const message = `expected status ${expectStatus}, got ${response.status}`;
    await log('error', message);
    throw new Error(message);
  }

  if (input.expectContains) {
    const body = await response.text();
    if (!body.includes(input.expectContains)) {
      const message = `response body did not contain "${input.expectContains}"`;
      await log('error', message);
      throw new Error(message);
    }
  }

  await log('ok', `${input.url} responded ${response.status}`);
  return { status: response.status };
}
