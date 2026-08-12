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

## Redis queue — needed since M5

FlowForge's queue (BullMQ) needs a real Redis instance — the server enqueues jobs onto it, the worker process dequeues and runs them.

**Local dev: run Redis locally, not on a hosted free tier.** BullMQ's idle polling has a real, ongoing command cost even with zero jobs running — a dev server left running overnight against a metered free tier can burn through its monthly command allowance on idle polling alone. Local dev should always point at a locally-running Redis:

- **Windows:** install [Memurai Developer](https://www.memurai.com/get-memurai) (free, Redis-protocol-compatible, runs as a Windows service). After installing, confirm it's running with `Get-Service Memurai` (PowerShell) — status should be `Running`.
- **Linux/macOS/WSL:** `sudo apt-get install redis-server` (or your platform's equivalent), then confirm with `redis-cli ping` — should return `PONG`.
- **Docker (any platform):** the repo's `docker-compose.yml` also starts Redis on `localhost:6379` — run `docker compose up -d`.

Whichever you use, set in **both** `server/.env` and `worker/.env`:
```
REDIS_URL=redis://127.0.0.1:6379
```

**Hosted Redis (Upstash or equivalent) is for deployed environments only** — never point local dev at it. If you're setting up a deployed environment:

1. Go to [upstash.com](https://upstash.com) and sign up (GitHub login is fastest, no credit card needed for the free tier).
2. Click **Create Database**.
3. Name it anything (e.g. `flowforge`), pick the region closest to you, and leave the type as **Regional**.
4. Once it's created, open the database and find the **Connect** tab.
5. Copy the connection string labeled **`ioredis`** or **`Redis URL`** — it starts with `rediss://` (note the double `s` — that means TLS is on, which Upstash requires). Don't use the REST API URL; BullMQ needs the raw Redis protocol one.
6. Set it as `REDIS_URL` in that environment's own config:
   ```
   REDIS_URL=rediss://default:...your string here...@....upstash.io:6379
   ```

## Running the queue and worker (M5 onward)

The server and the worker are two separate processes — this matches how they'd actually be deployed later, and it's the standard way BullMQ is used. Run each in its own terminal:

```bash
# Terminal 1 — the API server (enqueues jobs when you click "Run now" or hit /api/jobs/:id/trigger)
pnpm --filter=@flowforge/server dev

# Terminal 2 — the worker (actually executes jobs; without this running, triggered jobs just sit queued)
pnpm --filter=@flowforge/worker dev
```

Both need `DATABASE_URL` and `REDIS_URL` set in their own `.env` file (`server/.env` and `worker/.env` respectively — copy the same values into both).

### If you see "another live instance already holds..." and the process exits immediately

This is a safety guard, not a bug. A worker (or the server's schedule-tick worker) doesn't listen on any port, so nothing at the OS level stops two copies from accidentally running at once — that actually happened during this project's build and quietly wasted a hosted Redis free tier's entire monthly quota in under a week before anyone noticed (see `DECISIONS.md`). Each process now claims a small Redis lock on boot and refuses to start if another live instance already holds it.

- If you didn't mean to start a second one: you probably have a `pnpm dev` from an earlier terminal/session still running. Run `pnpm dev:clean` from the repo root — it finds and kills any orphaned FlowForge node processes on this machine, then start again.
- If you're deliberately running more than one worker at once (e.g. testing concurrency), set a distinct `WORKER_ID` for each one in its own `.env` — with `WORKER_ID` unset (the default), every instance on the same machine and the same checkout of this repo is treated as a duplicate of the same worker, on purpose. `EXPECTED_WORKER_FLEET_SIZE` in `worker/.env` controls when the boot-time log warns you about more instances than expected — it doesn't block anything, it's just a heads-up.
- `pnpm dev` runs `pnpm dev:clean` automatically first (via a `predev` script), so a plain restart shouldn't normally hit this at all — it's there for when you start `server`/`worker` directly (e.g. `tsx watch --env-file=.env src/index.ts`) without going through `pnpm dev`.

## Before demoing or viewing the dashboard

Seeded worker heartbeats go stale the moment real time passes — the *seeded* workers (worker-01 .. worker-08) have no live heartbeat loop keeping them fresh (that arrives at M6). Run this right before you look at the Workers page or demo the app, so 7 seeded workers read online and worker-08 reads offline (as designed) instead of all 8 reading offline:

```bash
pnpm --filter=@flowforge/server db:touch-workers
```

Note this is separate from the real worker process started above — that one registers and heartbeats its own row (e.g. an auto-generated id, or whatever `WORKER_ID` is set to) the moment it boots.

The 30-day seeded run history has the same problem for a different reason: `pnpm db:seed` generates failure/run data ending at "now" *at the moment it's run*, not at whatever moment you happen to load the app later. The Failures page's default window is 7 days, so this only bites if the last seed is more than about a week old — but if you're demoing or running a browser QA pass and the seed is stale, re-seed first:

```bash
pnpm --filter=@flowforge/server db:seed
```

## 1. Google Gemini API key (needed from M9 — AI Composer)

The Composer page (and, from M10, the Failures page's AI diagnosis) needs a Google Gemini API key. Without it the rest of the app keeps working exactly as before — only `POST /api/ai/compose` returns a clear "not configured" error instead of a result.

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Click **Create API key**. If asked, choose "Create API key in new project" (no billing needed — this is the free tier).
3. Copy the key it shows you (starts with `AIza...`).
4. Paste it into `server/.env` as:
   ```
   GEMINI_API_KEY=AIza...your key here...
   ```
5. `server/.env` already has `GEMINI_MODEL=gemini-3.5-flash-lite` filled in as a default — the current fastest, highest-quota free-tier model as of when this was written. **Model names and free-tier limits change over time** (Google renamed the whole lineup between when this app's spec was written and when it was actually built — 2.5 became 3.5 mid-build). If Composer starts returning model-not-found or quota errors, check [Google's current model list](https://ai.google.dev/gemini-api/docs/models) and swap the value — no code change needed, just edit the `.env` line and restart the server.

No worker changes needed — the AI composer only runs inside the server process.

## A note on running `pnpm dev` locally

`tsx watch` (what `pnpm dev` runs) does not load `.env` files by itself — the server will fail to start with a "DATABASE_URL/REDIS_URL missing" error unless you either export those variables in your shell first, or start it with Node's built-in env-file flag:

```bash
npx tsx watch --env-file=.env src/index.ts
```

This is a known gap in the `dev` script itself (tracked in `DECISIONS.md`), not something wrong with your `.env` file.
