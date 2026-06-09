#!/usr/bin/env bash
# ============================================================================
# Atlas — PostgreSQL backup (nightly via cron)
#
#   bash deploy/backup.sh
#
# Dumps the atlas database (plain SQL, --clean --if-exists for safe restore),
# gzips it, and prunes dumps older than BACKUP_RETENTION_DAYS.
#
# Cron (run as the deploy user) — daily at 03:00:
#   0 3 * * * /opt/atlas/deploy/backup.sh >> /var/log/atlas/backup.log 2>&1
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
[[ -f "$ROOT/.env" ]] && set -a && . "$ROOT/.env" && set +a

BACKUP_DIR="${BACKUP_DIR:-/opt/atlas/backups}"
RETENTION="${BACKUP_RETENTION_DAYS:-7}"
PG_USER="${POSTGRES_USER:-postgres}"
PG_DB="${POSTGRES_DB:-atlas}"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/atlas_${PG_DB}_${STAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"
echo "[backup $(date -Is)] dumping $PG_DB -> $OUT"

$COMPOSE exec -T postgres \
  pg_dump -U "$PG_USER" -d "$PG_DB" --clean --if-exists --no-owner \
  | gzip -9 > "$OUT"

# Integrity check: gzip must be valid and non-trivial in size.
if ! gzip -t "$OUT" 2>/dev/null || [[ "$(stat -c%s "$OUT")" -lt 1000 ]]; then
  echo "[backup] ERROR: dump appears invalid — removing $OUT"; rm -f "$OUT"; exit 1
fi

echo "[backup] OK: $(du -h "$OUT" | cut -f1)"

# Retention: delete dumps older than N days.
find "$BACKUP_DIR" -name 'atlas_*.sql.gz' -type f -mtime "+${RETENTION}" -print -delete

# Optional offsite (uncomment + configure):
#   aws s3 cp "$OUT" "s3://my-bucket/atlas/" --storage-class STANDARD_IA
echo "[backup] retention: kept last ${RETENTION} days."
