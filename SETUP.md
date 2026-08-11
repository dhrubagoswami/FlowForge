# FlowForge — Setup

This file is a running list of every credential the backend needs, in the order you'll be asked for them. Each numbered section has: what it is, exactly where to get it, and the exact line to paste into a `.env` file. Nothing here is needed yet — Phase 2 is being built code-first, so this file stays mostly empty until a milestone actually needs a key.

## Local database (Postgres) — needed since M2

1. Create a free project at [neon.tech](https://neon.tech).
2. On the project dashboard, copy the connection string (it looks like `postgresql://user:pass@host/db?sslmode=require`).
3. Paste it into `server/.env` and `worker/.env` as:
   ```
   DATABASE_URL=postgresql://...your string here...?sslmode=require
   ```

**Alternative — Docker, if you'd rather run Postgres locally:** the repo ships a `docker-compose.yml` at the root. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/), run `docker compose up -d` from the repo root to start Postgres on `localhost:5432`, then use `DATABASE_URL=postgres://flowforge:flowforge@localhost:5432/flowforge`.

## Redis queue (Upstash) — needed since M5

FlowForge's queue (BullMQ) needs a real Redis instance — the server enqueues jobs onto it, the worker process dequeues and runs them. Click-by-click:

1. Go to [upstash.com](https://upstash.com) and sign up (GitHub login is fastest, no credit card needed for the free tier).
2. Click **Create Database**.
3. Name it anything (e.g. `flowforge`), pick the region closest to you, and leave the type as **Regional**.
4. Once it's created, open the database and find the **Connect** tab.
5. Copy the connection string labeled **`ioredis`** or **`Redis URL`** — it starts with `rediss://` (note the double `s` — that means TLS is on, which Upstash requires). Don't use the REST API URL; BullMQ needs the raw Redis protocol one.
6. Paste it into **both** `server/.env` and `worker/.env` as:
   ```
   REDIS_URL=rediss://default:...your string here...@....upstash.io:6379
   ```

**Alternative — Docker, if you'd rather run Redis locally:** the same `docker-compose.yml` also starts Redis on `localhost:6379` — run `docker compose up -d`, then use `REDIS_URL=redis://localhost:6379` (no `s` — no TLS needed locally).

## Running the queue and worker (M5 onward)

The server and the worker are two separate processes — this matches how they'd actually be deployed later, and it's the standard way BullMQ is used. Run each in its own terminal:

```bash
# Terminal 1 — the API server (enqueues jobs when you click "Run now" or hit /api/jobs/:id/trigger)
pnpm --filter=@flowforge/server dev

# Terminal 2 — the worker (actually executes jobs; without this running, triggered jobs just sit queued)
pnpm --filter=@flowforge/worker dev
```

Both need `DATABASE_URL` and `REDIS_URL` set in their own `.env` file (`server/.env` and `worker/.env` respectively — copy the same values into both).

## Before demoing or viewing the dashboard

Seeded worker heartbeats go stale the moment real time passes — the *seeded* workers (worker-01 .. worker-08) have no live heartbeat loop keeping them fresh (that arrives at M6). Run this right before you look at the Workers page or demo the app, so 7 seeded workers read online and worker-08 reads offline (as designed) instead of all 8 reading offline:

```bash
pnpm --filter=@flowforge/server db:touch-workers
```

Note this is separate from the real worker process started above — that one registers and heartbeats its own row (e.g. an auto-generated id, or whatever `WORKER_ID` is set to) the moment it boots.

## 1. Google Gemini API key (needed at M9 — AI Composer)

Not needed yet. When M9 starts, this section will be filled in with click-by-click steps for Google AI Studio and the exact `GEMINI_API_KEY` / `GEMINI_MODEL` lines to paste into `server/.env`.
