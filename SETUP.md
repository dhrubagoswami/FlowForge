# FlowForge — Setup

This file is a running list of every credential the backend needs, in the order you'll be asked for them. Each numbered section has: what it is, exactly where to get it, and the exact line to paste into a `.env` file. Nothing here is needed yet — Phase 2 is being built code-first, so this file stays mostly empty until a milestone actually needs a key.

## Local database and queue (Postgres + Redis)

FlowForge needs a Postgres database and a Redis instance. This project builds against hosted free tiers — nothing to install.

1. Postgres: create a free project at [neon.tech](https://neon.tech), copy the connection string it gives you into `DATABASE_URL`.
2. Redis: create a free database at [upstash.com](https://upstash.com), copy the Redis connection string (the `rediss://...` one, not the REST URL) into `REDIS_URL`.

Paste both into `server/.env` and `worker/.env`.

**Alternative — Docker, if you'd rather run everything locally:** the repo ships a `docker-compose.yml` at the root. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/), run `docker compose up -d` from the repo root to start Postgres on `localhost:5432` and Redis on `localhost:6379`, then use:
```
DATABASE_URL=postgres://flowforge:flowforge@localhost:5432/flowforge
REDIS_URL=redis://localhost:6379
```

## Before demoing or viewing the dashboard

Seeded worker heartbeats go stale the moment real time passes — there's no live worker process writing fresh heartbeats until M5. Run this right before you look at the Workers page or demo the app, so 7 workers read online and worker-08 reads offline (as designed) instead of all 8 reading offline:

```bash
pnpm --filter=@flowforge/server db:touch-workers
```

## 1. Google Gemini API key (needed at M9 — AI Composer)

Not needed yet. When M9 starts, this section will be filled in with click-by-click steps for Google AI Studio and the exact `GEMINI_API_KEY` / `GEMINI_MODEL` lines to paste into `server/.env`.
