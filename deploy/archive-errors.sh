#!/usr/bin/env bash
# ============================================================================
# Atlas — daily error-log archival
#
# Extracts ERROR/CRITICAL/Traceback lines from the last 24h of container logs
# into /var/log/atlas/errors/. Container logs themselves rotate via json-file;
# this keeps a durable, greppable error history.
#
# Cron (deploy user) — daily at 03:30:
#   30 3 * * * /opt/atlas/deploy/archive-errors.sh
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OUT_DIR="/var/log/atlas/errors"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/$(date +%Y%m%d).log"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.monitoring.yml"

$COMPOSE logs --since 24h --no-color 2>&1 \
  | grep -iE 'error|critical|traceback|exception' \
  >> "$OUT" || true

echo "[archive-errors $(date -Is)] -> $OUT ($(wc -l < "$OUT" 2>/dev/null || echo 0) lines)"
