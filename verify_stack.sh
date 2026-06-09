#!/usr/bin/env bash
# End-to-end verification of the Atlas stack through the nginx gateway.
# Run after: docker compose up -d   (wait for all services healthy)
set -uo pipefail

GW="${GW:-http://localhost}"
PASS=0; FAIL=0
ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

echo "=== 1. Per-role health (each service reports its identity + mode) ==="
for svc in embedding-service rag-service agent-service; do
  out=$(docker compose exec -T "$svc" curl -fsS http://localhost:8000/health 2>/dev/null)
  echo "  $svc -> $out"
  echo "$out" | grep -q "\"service\":\"$svc\"" && ok "$svc health" || bad "$svc health"
done
# embedding-service must be local; rag/agent must be remote
docker compose exec -T embedding-service curl -fsS localhost:8000/health | grep -q '"mode":"local-embeddings"' && ok "embedding=local" || bad "embedding=local"
docker compose exec -T rag-service       curl -fsS localhost:8000/health | grep -q '"mode":"remote"'           && ok "rag=remote"       || bad "rag=remote"

echo "=== 2. Gateway routing ==="
curl -fsS "$GW/healthz" | grep -q ok && ok "gateway /healthz" || bad "gateway /healthz"

echo "=== 3. Build a real test image (Chinese + English real-estate text) ==="
python - <<'PY'
import fitz
doc=fitz.open(); page=doc.new_page(width=620,height=300)
for i,ln in enumerate(['北京朝阳区房地产周报','2026年6月成交均价88000元/平米','环比上涨1.5%','Beijing Chaoyang Weekly 2026-06']):
    page.insert_text(fitz.Point(20,60+i*55),ln,fontsize=18,color=(0,0,0))
open('verify_img.png','wb').write(page.get_pixmap(dpi=150).tobytes('png'))
print('wrote verify_img.png')
PY

echo "=== 4. Upload via gateway -> agent-service -> Qwen-VL OCR -> embedding-service -> DB ==="
UP=$(curl -fsS -F "file=@verify_img.png;type=image/png" "$GW/api/multimodal/upload")
echo "$UP" | python -c "import sys,json;d=json.load(sys.stdin);print('  doc',d['document_id'],'chunks',d['chunk_count'],'emb',d['embedding_count']);print('  OCR texts:',d['analysis']['texts'])" \
  && ok "multimodal upload" || bad "multimodal upload"
DOC=$(echo "$UP" | python -c "import sys,json;print(json.load(sys.stdin)['document_id'])")

echo "=== 5. Ask via gateway -> agent-service -> retrieval(embedding-service) -> DeepSeek ==="
CHAT=$(curl -fsS -X POST "$GW/api/agent/chat" -H 'Content-Type: application/json' \
  -d "{\"question\":\"北京朝阳区2026年6月成交均价是多少？\",\"document_id\":\"$DOC\",\"top_k\":5}")
echo "$CHAT" | python -c "import sys,json;d=json.load(sys.stdin);print('  answer:',d['answer'][:200]);print('  sources:',[s['file_name'] for s in d['sources']])" \
  && ok "agent QA" || bad "agent QA"

echo "=== 6. cleanup demo doc ==="
docker compose exec -T postgres psql -U postgres -d atlas -c "DELETE FROM knowledge_documents WHERE id='$DOC'::uuid;" >/dev/null 2>&1 && echo "  removed $DOC"
rm -f verify_img.png

echo "============================================"
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "STACK VERIFIED" || echo "STACK HAS FAILURES"
