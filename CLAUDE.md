# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Atlas is a bilingual (中文/EN) multi-agent real-estate advisor. It is **two
codebases in one repo**:

- **Frontend** (`src/`) — React 18 + TS (strict) + Vite 5 SPA. Dark-glassmorphism UI.
- **Backend** (`backend/`) — FastAPI multimodal RAG + agent service (PostgreSQL/pgvector,
  Redis, MinIO, BGE embeddings, DeepSeek QA, Qwen-VL vision, LangGraph agents).

The two are decoupled: the frontend runs **fully on bundled mock data** unless a
live backend is wired in (see Mock vs. live below).

## Commands

Frontend (repo root):
```bash
npm run dev        # Vite dev server on :5173 (https via basic-ssl)
npm run build      # tsc -b (type-check, fails build on errors) THEN vite build → dist/
npm run lint       # eslint, --max-warnings 0 (warnings fail)
npm run typecheck  # tsc --noEmit
```
There are no frontend unit tests.

Backend (`cd backend`):
```bash
./start.sh                      # installs deps, ensures tables, uvicorn --reload on :8000
pytest -q                       # full suite (asyncio_mode=auto)
pytest -q -k "not multimodal"   # CI default — skips paid Qwen-VL integration tests
pytest tests/test_rag_qa.py -q  # single file
pytest tests/test_auth.py::test_login -q   # single test
```
Tests need a real Postgres at `DATABASE_URL` with the schema already applied
(`psql ... -f init.sql`, or run the app once). Each test gets a fresh per-test
engine — see `tests/conftest.py` for the event-loop rationale.

Full stack locally: `docker compose up -d` (brings up the 8-service stack below,
health-gated, in order). `verify_stack.sh` smoke-tests it.

## Backend architecture

**One Docker image, three roles.** `backend/Dockerfile` builds a single image run
as three containers differentiated only by env vars (`docker-compose.yml`):

- `embedding-service` — **the model host**. Loads BGE once, serves `/api/embeddings/embed`.
  Has **no** `EMBEDDING_SERVICE_URL`.
- `rag-service` / `agent-service` — set `EMBEDDING_SERVICE_URL=http://embedding-service:8000`
  so they do **not** load the model; they proxy embedding work over HTTP (with retry/backoff).

`SERVICE_NAME` identifies the role in `/health` and logs. All config flows through
`app/core/config.py` (pydantic-settings, reads `backend/.env`).

**Routing & auth** (`app/main.py`):
- Auth routers (`/api/auth/*`) are **public**; `/auth/me` self-protects.
- `/api/embeddings/*` is intentionally **ungated** — it's called server-to-server
  by rag/agent without a user token. Do not add `get_current_user` to it.
- Everything else (`vision`, `rag`, `files`, `documents`, `chunks`, `vector`,
  `retrieval`, `agent`, `multimodal`) is gated by `Depends(get_current_user)`.

**Schema ownership:** `backend/init.sql` is the canonical schema (pgvector extension
+ tables + indexes), run **once** by the Postgres entrypoint on a fresh volume. The
`CREATE TABLE IF NOT EXISTS` / admin-seed logic in `main.py`'s lifespan is an
idempotent, race-safe safety-net for pre-existing volumes — not the source of truth.

**Auth model:** JWT dual-token (HS256) + bcrypt. Short-lived access token,
long-lived refresh token revocable via Redis jti allow-list. A bootstrap admin is
seeded on startup only if `ADMIN_PASSWORD` is set. `JWT_SECRET` defaults to an
insecure dev value — must be overridden in production.

**Agents (backend):** `CoordinatorAgent.run()` → routes to `KnowledgeAgent`, a
LangGraph RAG agent (`analyze → retrieve → synthesize`). Retrieval is **never**
bypassed. The DB session is injected via `RunnableConfig.configurable["db"]` so the
compiled graph is built once and reused. Synthesis calls DeepSeek when chunks are found.

## Frontend architecture

**Mock vs. live.** `src/services/api.ts` sets `USE_MOCK = (VITE_API_BASE === '')`.
Every service (`agentService`, `chatService`, `searchService`, …) branches on
`USE_MOCK`: mock path resolves from `src/mock/*` with realistic `wait()` latency so
status animations read naturally; live path hits the FastAPI backend. When adding a
service method, implement **both** branches.

**Auth wiring (circular-dep avoidance).** `api.ts` does not import the auth store.
Instead `authStore.ts` calls `registerAuthHooks({ getAccessToken, refresh })`. The
axios request interceptor attaches the bearer token; a 401 triggers a **single**
silent refresh that replays queued requests.

**Two unrelated "agent" concepts — do not conflate:**
- *Frontend advisory agents* — the 5-stage mock pipeline (Search → Market →
  Investment → Mortgage → Coordinator, plus 5 more surfaced on the dashboard).
  Status lifecycle (`idle → thinking → running → completed`) lives in
  `store/agentStore.ts`, animated with Framer Motion on `/report`.
- *Backend agents* — the real LangGraph Coordinator/Knowledge RAG agents above.

**Conventions:** `@/` aliases `src/` (`vite.config.ts` + `tsconfig`). Bilingual
strings come from `i18n/dict.ts` via the `useT` hook; language/theme in
`store/uiStore.ts`. Domain types in `types/index.ts`. Pages in `src/pages/`,
components grouped by domain under `src/components/`.

**Dev proxies** (`vite.config.ts`): `/api` → `http://localhost:8001`,
`/anthropic-proxy` → api.anthropic.com, `/deepseek-proxy` → api.deepseek.com.

## Deployment (CI/CD)

`.github/workflows/deploy.yml` on push to `main`: test (backend pytest, excludes
`multimodal`) → build & push two images to GHCR (`atlas-backend` from `backend/`,
`atlas-gateway` = nginx+SPA from `Dockerfile.frontend`) → SSH rolling deploy.

The server (Aliyun ECS, `/opt/atlas`) runs `deploy/deploy.sh <IMAGE_TAG>`: it sources
`/opt/atlas/.env` **before** resolving the tag so the CI-passed sha wins over the
pinned `IMAGE_TAG`, then does a health-gated rolling update (embedding-service first;
rag/agent tolerate its restart) with automatic rollback on health failure. Compose
overlay order: `docker-compose.yml` + `.prod.yml` (+ `.monitoring.yml` unless
`ENABLE_MONITORING=0`).

Server `.env` files (`/opt/atlas/.env`, `backend/.env`) are **gitignored and never
touched by deploys** — they hold China-mirror image URLs (`ghcr.nju.edu.cn/...`),
`HF_ENDPOINT`, and secrets. See `DEPLOYMENT.md` / `PRODUCTION.md` for the full runbook.
