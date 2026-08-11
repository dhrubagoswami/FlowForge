// Loads worker/.env before any test file runs, so modules that import config/env.ts at the top
// level (even pure-logic test files whose source module has an unrelated DB/Redis import chain)
// see the same DATABASE_URL/REDIS_URL `pnpm dev` already provides. Matches the gap logged in
// DECISIONS.md: `tsx watch` doesn't load .env either without an explicit --env-file flag.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);
