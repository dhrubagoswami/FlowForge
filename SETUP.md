# FlowForge — Setup

Follow this top to bottom, in order, on a fresh clone. Every step is required unless marked optional.

## 1. Install dependencies

```bash
pnpm install
```

## 2. Build the shared package

`server`, `worker`, and `web` all import `@flowforge/shared` as a **built** package (`packages/shared/dist/`), not directly from its TypeScript source — `pnpm install` does not build it. Skipping this step doesn't produce a clear error: `server`/`worker` fail with a confusing Node module-resolution error (`Cannot find package '...@flowforge/shared/dist/index.js'`) that gives no hint the fix is "build a different package first."

```bash
pnpm --filter=@flowforge/shared build
```

(Or `pnpm build` from the repo root, which builds `shared` first, then `server`/`worker`/`web`. Either works — you'll see `packages/shared build: Done` before the other three start.)

If you later pull changes that touch `packages/shared/src/`, re-run this — nothing watches and rebuilds it automatically the way `tsx watch` does for server/worker source.

## 3. Create your `.env` files

`server/.env.example` and `worker/.env.example` already exist in the repo, filled in with every variable name, a default where one makes sense, and a comment explaining what each one is. Copy both:

```bash
cp server/.env.example server/.env
cp worker/.env.example worker/.env
```

The rest of this file walks through what to fill in and where each value comes from. Both `.env` files need `DATABASE_URL` and `REDIS_URL` — copy the same values into both once you have them.

## 4. Database (Postgres)

1. Create a free project at [neon.tech](https://neon.tech).
2. On the project dashboard, copy the connection string (it looks like `postgresql://user:pass@host/db?sslmode=require`).
3. Paste it into **both** `server/.env` and `worker/.env` as:
   ```
   DATABASE_URL=postgresql://...your string here...?sslmode=require
   ```

**Alternative — Docker, if you'd rather run Postgres locally:** the repo ships a `docker-compose.yml` at the root. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/), run `docker compose up -d` from the repo root to start Postgres on `localhost:5432`, then use `DATABASE_URL=postgres://flowforge:flowforge@localhost:5432/flowforge`.

Once `DATABASE_URL` is set, create the schema:

```bash
pnpm --filter=@flowforge/server db:migrate
```

This command reads `server/.env` automatically (via `drizzle-kit`'s own built-in env loading) — no extra flag needed, unlike the `tsx`-run scripts below.

## 5. Redis (queue)

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

## 6. Seed the database (optional, but needed for the dashboard to show real data)

```bash
pnpm --filter=@flowforge/server db:seed
```

This creates 30 days of realistic history: 6 demo jobs, 8 seeded workers, and their run history. Without this, every page loads but shows an empty/zero state — nothing is broken, there's just nothing to look at yet.

Re-run this if the seed is more than about a week old — the Failures page's default window is 7 days, so stale seed data can silently fall outside it.

## 7. Google Gemini API key (optional — needed for the AI Composer and AI failure diagnosis)

Without this, the rest of the app works exactly as documented below — only `POST /api/ai/compose` (and the Failures page's AI diagnosis) returns a clear "not configured" error instead of a result.

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Click **Create API key**. If asked, choose "Create API key in new project" (no billing needed — this is the free tier).
3. Copy the key it shows you (starts with `AIza...`).
4. Paste it into `server/.env` as:
   ```
   GEMINI_API_KEY=AIza...your key here...
   ```
5. `server/.env.example` already has `GEMINI_MODEL=gemini-3.5-flash-lite` filled in as a default — the current fastest, highest-quota free-tier model as of when this was written. **Model names and free-tier limits change over time.** If Composer starts returning model-not-found or quota errors, check [Google's current model list](https://ai.google.dev/gemini-api/docs/models) and swap the value in `server/.env` — no code change needed, just edit the line and restart the server.

No worker changes needed — the AI composer only runs inside the server process.

## 8. Run everything

```bash
pnpm dev
```

This starts the server, the worker, and the web dashboard together, from the repo root, in one terminal. It also runs `pnpm dev:clean` first automatically, which kills any orphaned FlowForge process from a previous run that was never stopped.

Once it's up:
- **Dashboard:** [http://localhost:5173](http://localhost:5173)
- **API server:** [http://localhost:3001](http://localhost:3001) (the dashboard talks to this automatically — no config needed, it defaults to this address)
- **Worker:** no port, no URL — it's a background process consuming the queue. You'll know it's working because triggered/scheduled jobs actually complete instead of sitting `queued` forever.

If you'd rather run each piece in its own terminal (e.g. to watch one process's logs in isolation):

```bash
pnpm --filter=@flowforge/server dev   # http://localhost:3001
pnpm --filter=@flowforge/worker dev   # no port — just processes the queue
pnpm --filter=@flowforge/web dev      # http://localhost:5173
```

### Worker heartbeats and seeded data go stale over time

The *seeded* workers (worker-01 .. worker-08) have no live heartbeat loop keeping them fresh — only a real running worker process does. If you seeded data and then waited a while before starting the app, run this once right before you look at the Workers page, so 7 seeded workers read online and worker-08 reads offline (as designed) instead of all 8 reading offline:

```bash
pnpm --filter=@flowforge/server db:touch-workers
```

This is separate from the real worker process started above — that one registers and heartbeats its own row (an auto-generated id, or whatever `WORKER_ID` is set to in `worker/.env`) the moment it boots, and doesn't need this command.

## If you see "another live instance already holds..." and the process exits immediately

This is a safety guard, not a bug. A worker (or the server's schedule-tick worker) doesn't listen on any port, so nothing at the OS level stops two copies from accidentally running at once — that actually happened during this project's build and quietly wasted a hosted Redis free tier's entire monthly quota in under a week before anyone noticed (see `DECISIONS.md`). Each process now claims a small Redis lock on boot and refuses to start if another live instance already holds it.

- If you didn't mean to start a second one: you probably have a `pnpm dev` from an earlier terminal/session still running. Run `pnpm dev:clean` from the repo root — it finds and kills any orphaned FlowForge node processes on this machine, then start again.
- If you're deliberately running more than one worker at once (e.g. testing concurrency), set a distinct `WORKER_ID` for each one in its own `.env` — with `WORKER_ID` unset (the default), every instance on the same machine and the same checkout of this repo is treated as a duplicate of the same worker, on purpose. `EXPECTED_WORKER_FLEET_SIZE` in `worker/.env` controls when the boot-time log warns you about more instances than expected — it doesn't block anything, it's just a heads-up.
- `pnpm dev` runs `pnpm dev:clean` automatically first (via a `predev` script), so a plain restart shouldn't normally hit this at all — it's there for when you start `server`/`worker` directly (e.g. `tsx watch --env-file=.env src/index.ts`) without going through `pnpm dev`.

## A note on running server/worker scripts directly (outside `pnpm dev`)

`tsx watch` (what `pnpm dev` runs) and plain `tsx` (what `db:seed`, `db:generate` run) do **not** load `.env` files by themselves — only `db:migrate` does, because `drizzle-kit` bundles its own env loader. Every other script will fail with a "DATABASE_URL/REDIS_URL missing" error unless you either export those variables in your shell first, or start it with Node's built-in env-file flag:

```bash
npx tsx watch --env-file=.env src/index.ts
```

`pnpm dev`'s own `dev` script (`tsx watch --env-file=.env src/index.ts`) already does this correctly — this note only matters if you're running a script directly rather than through the `pnpm` script that wraps it.
