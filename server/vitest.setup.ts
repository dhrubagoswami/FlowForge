// Loads server/.env before any test file runs, so modules that import config/env.ts at the top
// level (even pure-logic test files whose source module has an unrelated DB/Redis import chain)
// see the same DATABASE_URL/REDIS_URL `pnpm dev` already provides. Matches worker/vitest.setup.ts
// — no server test imported db/client.ts until the M11 real-DB repository tests, so this gap
// existed but never surfaced until now.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
