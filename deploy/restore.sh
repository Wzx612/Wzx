#!/usr/bin/env bash
# ============================================================================
# Atlas — PostgreSQL restore (DESTRUCTIVE)
#
#   bash deploy/restore.sh <path/to/atlas_*.sql.gz> --yes
#
# Restores a gzipped pg_dump into the running Postgres container. The dump was
# created with --clean --if-exists, so existing objects are dropped & recreated.
# Requires the explicit --yes flag because this overwrites live data.
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -f "$ROOT/.env" ]] && set -a && . "$ROOT/.env" && set +a

FILE="${1:-}"
CONFIRM="${2:-}"
PG_USER="${POSTGRES_USER:-postgres}"
PG_DB="${POSTGRES_DB:-atlas}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

[[ -z "$FILE" || ! -f "$FILE" ]] && { echo "Usage: restore.sh <dump.sql.gz> --yes"; exit 1; }
if [[ "$CONFIRM" != "--yes" ]]; then
  echo "This will OVERWRITE the '$PG_DB' database from: $FILE"
  echo "Re-run with --yes to proceed."; exit 1
fi

echo "[restore $(date -Is)] restoring $FILE -> $PG_DB"
gunzip -c "$FILE" | $COMPOSE exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -v ON_ERROR_STOP=1

echo "[restore] complete. Recreating embeddings index stats…"
$COMPOSE exec -T postgres psql -U "$PG_USER" -d "$PG_DB" -c "ANALYZE;" || true
echo "[restore] done. Restart app services if needed:  docker compose ... restart rag-service agent-service"
