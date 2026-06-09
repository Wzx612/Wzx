#!/usr/bin/env bash
# ============================================================================
# Atlas — rollback to a previous image tag
#
#   bash deploy/rollback.sh <IMAGE_TAG>
#   bash deploy/rollback.sh                # uses .rollback_tag (last good)
#
# Re-pins IMAGE_TAG and re-rolls the app services with health gating.
# ============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-}"
[[ -z "$TARGET" && -f "$ROOT/.rollback_tag" ]] && TARGET="$(cat "$ROOT/.rollback_tag")"
[[ -z "$TARGET" ]] && { echo "No target tag given and no .rollback_tag found."; exit 1; }

ENV_FILE="$ROOT/.env"
[[ -f "$ENV_FILE" ]] && set -a && . "$ENV_FILE" && set +a
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.monitoring.yml"

echo "[rollback] reverting to tag: $TARGET"
if grep -qE '^IMAGE_TAG=' "$ENV_FILE"; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${TARGET}|" "$ENV_FILE"
else
  echo "IMAGE_TAG=${TARGET}" >> "$ENV_FILE"
fi
export IMAGE_TAG="$TARGET"

$COMPOSE pull
for svc in embedding-service rag-service agent-service nginx; do
  $COMPOSE up -d --no-deps "$svc"
done
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}"
echo "[rollback] complete — tag $TARGET is live."
