// notify.webhook — POST a payload to a URL. Used for both user-defined jobs and consecutive-failure alerting.
import type { TaskInputFor } from '@flowforge/shared';
import type { TaskLogger } from '../lib/task-logger.ts';

export async function runNotifyWebhook(input: TaskInputFor<'notify.webhook'>, log: TaskLogger): Promise<Record<string, unknown>> {
  await log('info', `POST ${input.url}`);

  const response = await fetch(input.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input.payload),
  });

  if (!response.ok) {
    const message = `webhook responded with status ${response.status}`;
    await log('error', message);
    throw new Error(message);
  }

  await log('ok', `${input.url} accepted the payload (${response.status})`);
  return { status: response.status };
}
