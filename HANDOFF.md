# FlowForge — Handoff

Written at the end of Phase 2, before a context clear, to hand off into Phase 3. Read this first if you have no memory of prior work.

## 1. Status

**Phase 1 (frontend prototype) and Phase 2 (full backend, M0–M11) are both complete and pushed to `main`.** 218 tests passing (33 shared, 147 server, 38 worker), build clean across all four packages. **Phase 3 (AWS EC2 deployment) has not started** — it's the next work, in a separate session.

## 2. What the system is

FlowForge is a job-scheduler dashboard: a Fastify API server (`server/`) exposes job/run/worker/failure/AI routes and a Server-Sent Events stream; a BullMQ worker (`worker/`) runs as a separate process, executing jobs with retries, exponential backoff, and idempotency; both talk to a shared Postgres database (via Drizzle ORM) and a shared Redis instance (BullMQ queue plus a pub/sub bridge that carries worker-originated events into the server's SSE stream) — never directly to each other. Table definitions and zod schemas live in `packages/shared`, imported by both, so there's never two hand-maintained copies of the schema. `web/` is a React + TypeScript + Vite dashboard consuming the API and the SSE stream. AI features (a plain-English job composer and a failure-cluster diagnosis tool) run through Google Gemini, with every model response schema-validated before it can reach the database.

## 3. Current runtime setup

- **Redis:** self-hosted Memurai on `127.0.0.1:6379`, local dev only.
- **Postgres:** hosted Neon, region `ap-southeast-1` (Singapore).
- **AI:** Google Gemini (`gemini-3.5-flash-lite` as of this writing — model names/limits change over time, see SETUP.md).
- **Upstash** (hosted Redis) exists as a documented option but is **deployed-only and currently unused** — local dev deliberately never points at it (idle BullMQ polling has a real, ongoing command cost that would exhaust a metered free tier just by being left running; see `DECISIONS.md`).

## 4. Phase 3 scope, as currently planned

Not started. Pre-deployment requirements already logged in `DECISIONS.md` (§16 of `PHASE2.md`) that the eventual deployment work must cover:

1. **Cost visibility, two independent layers:** an AWS Budgets alert at a $1 threshold, plus a separate CloudWatch billing alarm — two different alerting paths so one misconfiguration doesn't silently remove all cost visibility.
2. **Redis self-hosted on the EC2 instance**, configured with `maxmemory` and `allkeys-lru` eviction, sized against the instance's actual RAM — not left at Redis's unbounded-growth default.
3. **Server and worker run as systemd services** with restart limits, not `pnpm dev` — systemd's own process tracking is what actually prevents the class of incident that already happened locally (10 duplicate long-lived dev processes, untracked by anything, silently multiplying Redis command spend).
4. **The single-instance Redis lock needs re-confirmation under systemd's actual restart behavior** (`Restart=on-failure`-style respawns, `RestartSec` timing) before Phase 3 can trust it — it was designed and tested against a bare process kill, not against a supervisor that immediately restarts the process.

## 5. Known constraints Phase 3 must account for

- **~88ms measured RTT, Bengaluru → Neon Singapore** (sequential round-trip, measured directly during the M11 load test). EC2 region selection matters more to real-world performance than anything else measured this phase — put the instance near Neon, or this number gets worse, not better.
- **Free-tier EC2 has ~1GB RAM total**, shared between the OS, Node (server + worker, both resident), and Redis's own dataset — this is exactly why item 2 above (`maxmemory`/`allkeys-lru`) isn't optional.
- **Worker peak RSS measured at 51.9MB** under the M11 load test's `simulate` task profile (near-zero per-task memory cost, local Redis, no network buffering pressure). This is not a bound on what a real task mix would cost — re-measure once Phase 3's actual jobs exist.
- **AWS free tier expires 12 months from account creation.** Whatever instance size and Redis config gets chosen needs a known path forward once that credit period ends, not just a plan for during it.

## 6. Open items

- **Gemini API key rotation is still pending** — not yet done, needs doing before or during Phase 3 setup.
- **A full "stranger clones this cold" test of SETUP.md was deliberately deferred** until after deployment. Reasoning: nobody is actually going to clone this repo cold — Phase 3's real deployment will exercise the same setup sequence for real, under real constraints, and is a better test than a synthetic one. If Phase 3 setup hits a gap SETUP.md doesn't cover, fix it there, in context.

## 7. Working agreement — carries forward

- Strict layering: routes → services → repositories → database. No skipping a layer, no raw SQL in a service, no HTTP handling in a repository.
- `DECISIONS.md` gets updated as work happens, not retroactively.
- Report measured numbers, not qualitative assessments.
- **Browser verification is a required gate, and the owner does it — not you.** Server-side/log-based verification only otherwise, and say so explicitly when that's the limit of what was checked.

## 8. Five defects that were only found by measurement

This is the most valuable pattern this project produced: each of these looked correct under code review, under the verification method used immediately before it, or under normal dev-scale usage — and was only caught by actually measuring something at volume or against a real client. Carry this discipline into Phase 3; don't let "it looks right" substitute for "it was measured."

1. **Redis idle command floor** — assumed BullMQ's polling cost was negligible; a live `MONITOR` capture (`pnpm redis:floor`) measured it directly and found ~1.1 cmd/sec structural idle floor per process, which had already exhausted an Upstash free tier in under a week from idle dev processes alone. Missed by: never having measured actual command volume, only reasoning about it.
2. **SSE CORS headers dropped** — a raw `reply.raw.writeHead()` silently discarded headers Fastify's CORS plugin had already set. Missed by: `fetch()`-based verification that happened to hold the connection open long enough to still see the header arrive late, masking that a client with a realistic timeout would have failed.
3. **SSE subscriber never wired** — `startRedisEventSubscriber()` was fully implemented and never called from `index.ts`. Missed by: every earlier verification pass checking that a connection succeeded, never checking that a specific event actually arrived over it.
4. **Connection pool size fixed at 10 regardless of worker concurrency** — postgres.js's default pool size never scaled with `WORKER_CONCURRENCY` (50), collapsing throughput under sustained load. Missed by: normal dev runs at `WORKER_CONCURRENCY=4`, well under the default pool size, so the mismatch was invisible until the M11 load test pushed real concurrent volume through.
5. **Worker row leak in the load test's own cleanup** — the load test's spawned worker registered a `workers` row that its cleanup routine never deleted, and 8 had silently accumulated across runs before one of them broke an unrelated repository test by outranking its fixture data. Missed by: cleanup code that deleted the job/run rows it had created but never checked what else a spawned child process might have written on its own.
