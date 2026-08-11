CREATE TYPE "public"."ai_cache_kind" AS ENUM('compose', 'diagnose');--> statement-breakpoint
CREATE TYPE "public"."job_health" AS ENUM('healthy', 'degraded', 'failing', 'paused');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."retry_backoff" AS ENUM('fixed', 'exponential');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('http.check', 'http.fetch_json', 'report.generate', 'notify.webhook', 'db.snapshot', 'simulate');--> statement-breakpoint
CREATE TYPE "public"."trigger_type" AS ENUM('cron', 'webhook', 'manual');--> statement-breakpoint
CREATE TYPE "public"."log_level" AS ENUM('info', 'ok', 'warn', 'error');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'retrying', 'dead_letter', 'cancelled', 'skipped_duplicate');--> statement-breakpoint
CREATE TYPE "public"."run_trigger_source" AS ENUM('schedule', 'manual', 'webhook', 'demo');--> statement-breakpoint
CREATE TYPE "public"."worker_status" AS ENUM('online', 'draining', 'offline');--> statement-breakpoint
CREATE TABLE "ai_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "ai_cache_kind" NOT NULL,
	"input_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"model" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_cache_input_hash_unique" UNIQUE("input_hash")
);
--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"key" text PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" "trigger_type" NOT NULL,
	"cron_expr" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"task_type" "task_type" NOT NULL,
	"task_input" jsonb NOT NULL,
	"status" "job_status" DEFAULT 'active' NOT NULL,
	"health" "job_health" DEFAULT 'healthy' NOT NULL,
	"timeout_ms" integer DEFAULT 120000 NOT NULL,
	"retry_attempts" integer DEFAULT 3 NOT NULL,
	"retry_backoff" "retry_backoff" DEFAULT 'exponential' NOT NULL,
	"retry_base_ms" integer DEFAULT 30000 NOT NULL,
	"idempotency_key_template" text NOT NULL,
	"idempotency_ttl_seconds" integer DEFAULT 86400 NOT NULL,
	"alert_after_consecutive_failures" integer DEFAULT 3 NOT NULL,
	"alert_channel" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"level" "log_level" NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" text NOT NULL,
	"status" "run_status" NOT NULL,
	"trigger_source" "run_trigger_source" NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"max_attempts" integer NOT NULL,
	"queued_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"wait_ms" integer,
	"worker_id" text,
	"idempotency_key" text NOT NULL,
	"error_message" text,
	"error_type" text,
	"output" jsonb,
	"scheduled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" text PRIMARY KEY NOT NULL,
	"hostname" text NOT NULL,
	"status" "worker_status" DEFAULT 'online' NOT NULL,
	"concurrency" integer NOT NULL,
	"inflight" integer DEFAULT 0 NOT NULL,
	"last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_logs" ADD CONSTRAINT "run_logs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "run_logs_run_id_ts_idx" ON "run_logs" USING btree ("run_id","ts");--> statement-breakpoint
CREATE INDEX "runs_job_id_queued_at_idx" ON "runs" USING btree ("job_id","queued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runs_queued_at_idx" ON "runs" USING btree ("queued_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_idempotency_key_idx" ON "runs" USING btree ("idempotency_key");