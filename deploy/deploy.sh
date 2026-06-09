#!/usr/bin/env bash
# ============================================================================
# Atlas — production rollout (runs on the server, invoked by CI over SSH)
#
#   bash deploy/deploy.sh <IMAGE_TAG>      # e.g. sha-<gitsha> or latest
#
# Pulls the new images and performs a health-gated ROLLING update so the stack
# is never fully down. The embedding-service is rolled first; rag/agent tolerate
# its brief restart via built-in HTTP retry/backoff. On health failure it
# automatically rolls back to the previous tag.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

IMAGE_TAG="${1:-${IMAGE_TAG:-latest}}"
ENV_FILE="$ROOT/.env"
[[ -f "$ENV_FILE" ]] && set -a && . "$ENV_FILE" && set +a

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.monitoring.yml"
APP_SERVICES=(embedding-service rag-service agent-service nginx)
LOG() { echo -e "\033[1;34m[deploy $(date +%H:%M:%S)]\033[0m $*"; }

# ── Record the currently-running tag for rollback ───────────────────────────
PREV_TAG="$(grep -E '^IMAGE_TAG=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 || true)"
[[ -n "${PREV_TAG:-}" ]] && echo "$PREV_TAG" > "$ROOT/.rollback_tag" && LOG "previous tag saved: $PREV_TAG"

# ── Pin the new tag in .env (so manual `up` reuses it) ──────────────────────
if grep -qE '^IMAGE_TAG=' "$ENV_FILE"; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" "$ENV_FILE"
else
  echo "IMAGE_TAG=${IMAGE_TAG}" >> "$ENV_FILE"
fi
export IMAGE_TAG
LOG "deploying tag: $IMAGE_TAG"

# ── Pull new images ─────────────────────────────────────────────────────────
LOG "pulling images…"
$COMPOSE pull

# ── Ensure infra is up (no-op if already running) ───────────────────────────
$COMPOSE up -d postgres redis minio
# Idempotent schema safety-net (CREATE IF NOT EXISTS — harmless if up to date).
LOG "applying idempotent schema…"
$COMPOSE exec -T postgres psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-atlas}" \
  < backend/init.sql >/dev/null 2>&1 || LOG "schema apply skipped (db not ready / already current)"

# ── Health helper ───────────────────────────────────────────────────────────
wait_healthy() {
  local svc="$1" tries="${2:-40}"
  local cid; cid="$($COMPOSE ps -q "$svc")"
  [[ -z "$cid" ]] && { LOG "no container for $svc"; return 1; }
  for ((i=1;i<=tries;i++)); do
    local st; st="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo none)"
    [[ "$st" == "healthy" ]] && { LOG "$svc healthy"; return 0; }
    [[ "$st" == "none" ]] && { LOG "$svc has no healthcheck — assuming up"; return 0; }
    sleep 3
  done
  LOG "TIMEOUT waiting for $svc to become healthy"; return 1
}

# ── Rolling update, service by service ──────────────────────────────────────
rollback() {
  LOG "!! rolling back"
  if [[ -f "$ROOT/.rollback_tag" ]]; then
    bash "$ROOT/deploy/rollback.sh" "$(cat "$ROOT/.rollback_tag")"
  else
    LOG "no rollback tag recorded — manual intervention required"
  fi
  exit 1
}

for svc in "${APP_SERVICES[@]}"; do
  LOG "updating $svc…"
  $COMPOSE up -d --no-deps "$svc"
  wait_healthy "$svc" || rollback
done

# ── Bring up monitoring + anything else, prune dangling images ──────────────
$COMPOSE up -d --remove-orphans
docker image prune -f >/dev/null 2>&1 || true

LOG "deploy complete — tag $IMAGE_TAG live."
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}"
