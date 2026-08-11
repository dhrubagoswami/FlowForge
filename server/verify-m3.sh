#!/usr/bin/env bash
# Hits every M3 GET endpoint against a running server and prints status + a truncated body.
# Usage: pnpm --filter=@flowforge/server dev   (in one terminal)
#        bash server/verify-m3.sh              (in another)
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"

hit() {
  local method="$1" path="$2"
  echo "--- $method $path ---"
  curl -s -o /tmp/flowforge-verify-body -w "HTTP %{http_code}\n" -X "$method" "$BASE_URL$path"
  head -c 500 /tmp/flowforge-verify-body
  echo ""
  echo ""
}

hit GET /api/health
hit GET /api/stats/overview
hit GET /api/jobs
hit GET "/api/jobs?status=active"
hit GET "/api/jobs?status=paused"
hit GET /api/jobs/churn-model-retrain
hit GET /api/jobs/does-not-exist
hit GET "/api/jobs/docs-embedding-index/runs?limit=10"
hit GET "/api/jobs/docs-embedding-index/runs?cursor=not-a-real-cursor"
hit GET "/api/runs?limit=20"
hit GET "/api/runs?status=dead_letter"
hit GET /api/runs/00000000-0000-0000-0000-000000000000
hit GET /api/workers
hit GET /api/failures/clusters
hit GET "/api/failures/clusters?windowHours=720"
hit GET "/api/failures/clusters?jobId=docs-embedding-index"
hit GET /api/this-route-does-not-exist

rm -f /tmp/flowforge-verify-body
