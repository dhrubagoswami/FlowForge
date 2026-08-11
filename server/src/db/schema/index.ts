// Re-exports the Drizzle table definitions from @flowforge/shared, so drizzle-kit and every
// server import path that reads `../db/schema/index.ts` keep working unchanged. The table
// definitions themselves live in packages/shared so the worker (which writes to the same tables
// directly) shares the exact same column definitions — never two hand-maintained copies.
export * from '@flowforge/shared';
