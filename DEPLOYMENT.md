# Atlas — Enterprise Deployment Guide

Multimodal RAG platform: image/PDF upload → parse → chunk → embed → vector
retrieval → DeepSeek Q&A, served by three containerized application services
behind an nginx gateway.

---

## 1. Quick start

```bash
# 1. Provide secrets (Qwen-VL + DeepSeek keys)
cp backend/.env.example backend/.env      # then edit DASHSCOPE_API_KEY / DEEPSEEK_API_KEY
# (optional) override infra ports/passwords
cp .env.example .env

# 2. Launch the whole stack
docker compose up -d

# 3. Watch it become healthy
docker compose ps
```

`docker compose up -d` performs, with health gating, **fully automatically**:

| Step | Owner | What happens |
| --- | --- | --- |
| Database init | `postgres` entrypoint runs `init.sql` | creates all tables + indexes |
| pgvector extension | `init.sql` | `CREATE EXTENSION IF NOT EXISTS vector` |
| MinIO bucket | `minio-init` (one-shot `mc`) | creates `atlas-images` bucket |
| Redis | `redis` | starts with AOF persistence |
| Backend | `embedding` / `rag` services | start after DB+Redis healthy |
| Agent | `agent-service` | starts after embedding-service healthy |

Gateway: **http://localhost** · MinIO console: **http://localhost:9001**

---

## 2. System architecture

```
                                  ┌──────────────────────────────┐
                                  │            Clients            │
                                  │     Browser SPA · REST API    │
                                  └───────────────┬──────────────┘
                                                  │ :80
                                  ┌───────────────▼──────────────┐
                                  │           nginx               │
                                  │   API gateway + static SPA    │
                                  │   path-based routing          │
                                  └───┬───────────┬───────────┬───┘
            /api/embeddings/ ─────────┘           │           └───── /api/(agent|multimodal|vision)
                              ┌───────────────┐    │ /api/* (rag,    ┌──────────────────┐
                              ▼               │    │ files, docs,    ▼                  │
                  ┌────────────────────┐      │    │ chunks, vector, ┌────────────────────┐
                  │  embedding-service │      │    │ retrieval)      │   agent-service    │
                  │  ───────────────── │      │    ▼                 │  ───────────────── │
                  │  BGE bge-large-zh  │   ┌────────────────────┐    │  Knowledge Agent   │
                  │  (loaded ONCE)     │   │    rag-service     │    │  (LangGraph)       │
                  │  POST /embed       │◀──┤  upload·PDF parse  │    │  multimodal upload │
                  │  POST /generate/id │◀──┤  chunk·retrieval   │    │  Qwen-VL · OCR     │
                  └─────────┬──────────┘   │  DeepSeek QA       │    └─────────┬──────────┘
                            │              └─────────┬──────────┘              │
        embeddings (HTTP)   │  rag/agent proxy embeddings here                 │
                            │                        │                         │
          ┌─────────────────┴────────────┬──────────┴───────────┬─────────────┘
          ▼                               ▼                      ▼
  ┌────────────────┐            ┌──────────────────┐    ┌────────────────┐
  │   PostgreSQL   │            │      Redis       │    │     MinIO      │
  │   + pgvector   │            │  query-embed     │    │  object store  │
  │  chunks+vectors│            │  cache (fail-open)│   │  images/files  │
  └────────────────┘            └──────────────────┘    └────────────────┘
          ▲                                                     ▲
          │ external APIs ──────────────────────────────────────┘
          └─ Qwen-VL-Max (DashScope) · DeepSeek Chat (api.deepseek.com)
```

**Key design choice — single image, three roles.** All three application
services run the *same* `atlas-backend` image; behaviour is differentiated by
environment variables. Only `embedding-service` loads the 1.3 GB BGE model;
`rag-service` and `agent-service` set `EMBEDDING_SERVICE_URL` and proxy all
embedding work to it over HTTP. The model loads **once** and scales
independently of request-handling services.

---

## 3. Container relationship (dependencies & startup order)

```
            docker compose up -d
                     │
        ┌────────────┼─────────────────────────┐
        ▼            ▼                          ▼
   ┌─────────┐  ┌─────────┐               ┌─────────┐
   │postgres │  │  redis  │               │  minio  │
   │(health) │  │(health) │               │(health) │
   └────┬────┘  └────┬────┘               └────┬────┘
        │            │                         │ healthy
        │            │                         ▼
        │            │                   ┌───────────┐
        │            │                   │minio-init │  creates bucket, exits 0
        │            │                   └───────────┘
        │ healthy    │ healthy
        └─────┬──────┘
              ▼
     ┌──────────────────┐
     │ embedding-service│  loads BGE model → becomes healthy
     └────────┬─────────┘
              │ healthy
     ┌────────┴─────────┐
     ▼                  ▼
┌──────────┐      ┌──────────────┐
│rag-service│     │agent-service │   (both also need postgres+redis+minio healthy)
└────┬─────┘      └──────┬───────┘
     │ healthy           │ healthy
     └─────────┬─────────┘
               ▼
          ┌─────────┐
          │  nginx  │  gateway up → stack ready
          └─────────┘

depends_on conditions:
  embedding-service → postgres(healthy), redis(healthy)
  rag-service       → postgres, redis, minio, embedding-service (all healthy)
  agent-service     → postgres, redis, minio, embedding-service (all healthy)
  nginx             → embedding, rag, agent (all healthy)
  minio-init        → minio(healthy)
```

---

## 4. Network topology

```
┌───────────────────────────── host ──────────────────────────────────┐
│                                                                       │
│  Published ports:                                                     │
│    :80   → nginx        :9000 → minio API     :9001 → minio console   │
│    :5432 → postgres*    :6379 → redis*        (*dev convenience)      │
│                                                                       │
│   ┌──────────────── docker network: atlas-net (bridge) ───────────┐  │
│   │                                                                │  │
│   │   nginx ──┬─────────────► embedding-service:8000               │  │
│   │           ├─────────────► rag-service:8000                     │  │
│   │           └─────────────► agent-service:8000                   │  │
│   │                                                                │  │
│   │   rag-service   ───────►  embedding-service:8000  (HTTP embed) │  │
│   │   agent-service ───────►  embedding-service:8000  (HTTP embed) │  │
│   │                                                                │  │
│   │   embedding/rag/agent ─►  postgres:5432                        │  │
│   │   embedding/rag/agent ─►  redis:6379                           │  │
│   │   rag/agent          ──►  minio:9000                           │  │
│   │   minio-init         ──►  minio:9000                           │  │
│   │                                                                │  │
│   └────────────────────────────────────────────────────────────────┘ │
│                              │ egress                                  │
│                              ▼                                         │
│        DashScope (Qwen-VL-Max)  ·  DeepSeek Chat API                   │
└───────────────────────────────────────────────────────────────────────┘

Internal service-to-service traffic uses docker DNS (service names) on
atlas-net and never leaves the host. Only nginx (:80) needs to be public;
the :5432/:6379 publishes are for dev/debug and can be dropped in production.
```

---

## 5. Service reference

| Service | Image | Role | Exposed routes (via nginx) |
| --- | --- | --- | --- |
| `nginx` | nginx:1.27-alpine | Gateway + SPA | `/`, `/api/*`, `/healthz` |
| `embedding-service` | atlas-backend | BGE model host | `/api/embeddings/*` |
| `rag-service` | atlas-backend | Upload/parse/chunk/retrieval/QA | `/api/{files,documents,chunks,vector,retrieval,rag}/*` |
| `agent-service` | atlas-backend | Knowledge Agent + multimodal | `/api/{agent,multimodal,vision}/*` |
| `postgres` | pgvector/pgvector:pg16 | Vector DB | `:5432` |
| `redis` | redis:7-alpine | Embedding cache | `:6379` |
| `minio` | minio/minio | Object storage | `:9000` / `:9001` |
| `minio-init` | minio/mc | One-shot bucket creator | — |

### Environment variables (application)

| Var | embedding | rag / agent | Meaning |
| --- | --- | --- | --- |
| `SERVICE_NAME` | `embedding-service` | `rag/agent-service` | identity in `/health` + logs |
| `EMBEDDING_SERVICE_URL` | *(unset)* | `http://embedding-service:8000` | enables remote-embedding mode |
| `DATABASE_URL` | ✓ | ✓ | asyncpg DSN → `postgres` |
| `REDIS_URL` | ✓ | ✓ | `redis://redis:6379/0` |
| `MINIO_ENDPOINT` | ✓ | ✓ | `minio:9000` |
| `DASHSCOPE_API_KEY` | — | agent | Qwen-VL-Max (from `backend/.env`) |
| `DEEPSEEK_API_KEY` | — | rag/agent | DeepSeek (from `backend/.env`) |

---

## 6. Verifying a live deployment

```bash
# Service health (each reports its role + embedding mode)
curl http://localhost/api/agent/../  # via gateway
docker compose exec rag-service curl -s localhost:8000/health
# → {"status":"ok","service":"rag-service","mode":"remote"}
docker compose exec embedding-service curl -s localhost:8000/health
# → {"status":"ok","service":"embedding-service","mode":"local-embeddings"}

# End-to-end: upload an image → index → ask
curl -F "file=@report.png;type=image/png" http://localhost/api/multimodal/upload
curl -X POST http://localhost/api/agent/chat \
     -H 'Content-Type: application/json' \
     -d '{"question":"这张图片说了什么？","top_k":5}'
```

---

## 7. Operations

**Logs**
```bash
docker compose logs -f rag-service agent-service embedding-service
```

**Scale request handlers** (embedding-service stays singular — it is the model host):
```bash
docker compose up -d --scale rag-service=3 --scale agent-service=2
```
> To load-balance scaled replicas, switch the nginx upstreams to a resolver-based
> config or place the services behind docker's built-in DNS round-robin.

**Backups**
```bash
docker compose exec postgres pg_dump -U postgres atlas > atlas_$(date +%F).sql
# MinIO data lives in the minio_data volume; mirror with: mc mirror local/atlas-images ./backup
```

**Reset (DESTROYS data — removes volumes incl. DB, MinIO, model cache):**
```bash
docker compose down -v
```

**IVFFlat index tuning.** `init.sql` creates `lists = 100` IVFFlat indexes. After
loading substantial data, rebuild with a larger list count and set probes per query
for recall/latency balance (`SET ivfflat.probes = 10;`).

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `502` from `/api/multimodal/upload` | DashScope throttling | built-in retry/backoff handles transient cases; check `DASHSCOPE_API_KEY` |
| rag/agent stuck "starting" | waiting on embedding-service health | first boot downloads BGE (~1.3 GB) into `model_cache`; wait or check `docker compose logs embedding-service` |
| `relation ... does not exist` | DB volume predates `init.sql` | `docker compose down -v` then `up -d`, or apply `init.sql` by hand |
| Frontend 404 at `/` | `dist/` not built | `npm run build` (with `VITE_API_BASE=/api`) then `docker compose restart nginx` |
| Images not viewable | bucket policy | `minio-init` sets `download`; re-run `docker compose up minio-init` |

---

## 9. Production hardening checklist

- [ ] Change `POSTGRES_PASSWORD` and `MINIO_ROOT_*` from defaults (set in `.env`).
- [ ] Drop the `:5432` / `:6379` host port publishes (internal-only).
- [ ] Terminate TLS at nginx (add a `443` server + certs) or front with a load balancer.
- [ ] Pin image digests; build `atlas-backend` in CI and push to a registry.
- [ ] Set container memory/CPU limits (`deploy.resources`) — embedding-service needs ≥2 GB.
- [ ] Centralize logs/metrics (the app logs structured lines to stdout).
- [ ] Rotate `DASHSCOPE_API_KEY` / `DEEPSEEK_API_KEY` via a secrets manager.
```
