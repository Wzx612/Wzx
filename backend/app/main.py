import asyncio
import logging
import sys
from contextlib import asynccontextmanager

# On Windows, asyncpg requires the Selector event loop (the default Proactor
# loop breaks asyncpg connections under uvicorn). No-op on Linux/macOS, where
# the production containers run. Lets the backend run locally via `uvicorn` for
# localhost development.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text as _sql_text

from app.core.config import settings
from app.core.security import get_current_user
from app.api.auth import router as auth_router
from app.api.rag import router as rag_router
from app.api.files import router as files_router
from app.api.documents import router as documents_router
from app.api.chunks import router as chunks_router
from app.api.embeddings import router as embeddings_router
from app.api.vector import router as vector_router
from app.api.retrieval import router as retrieval_router
from app.api.chat import router as chat_router
from app.api.chat_stream import router as chat_stream_router
from app.api.agent import router as agent_router
from app.api.media import router as media_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Wait for the database to accept connections before serving traffic.

    Under docker compose, depends_on/healthcheck already gates startup; this is
    a belt-and-suspenders guard so a slow-starting Postgres doesn't crash-loop
    the app. Schema/extension creation is owned by init.sql (Postgres entrypoint).
    """
    from app.core.database import engine

    for attempt in range(1, 31):
        try:
            async with engine.connect() as conn:
                await conn.execute(_sql_text("SELECT 1"))
            logging.getLogger(__name__).info(
                "[%s] database ready", settings.SERVICE_NAME
            )
            break
        except Exception as exc:  # noqa: BLE001 — retry on any connection error
            logging.getLogger(__name__).warning(
                "[%s] database not ready (attempt %d/30): %s",
                settings.SERVICE_NAME, attempt, exc,
            )
            await asyncio.sleep(2)

    await _seed_admin(engine)
    yield


async def _seed_admin(engine) -> None:
    """Ensure the users table exists and a bootstrap admin is present.

    Idempotent and race-safe (ON CONFLICT) so it is harmless when run by all
    three service replicas. Skipped unless ADMIN_PASSWORD is configured.
    init.sql owns the canonical schema; the CREATE TABLE here is a safety-net so
    auth works even on a pre-existing DB volume where init.sql won't re-run.
    """
    if not settings.ADMIN_PASSWORD:
        return
    log = logging.getLogger(__name__)
    try:
        from app.core.security import hash_password

        async with engine.begin() as conn:
            await conn.execute(_sql_text("""
                CREATE TABLE IF NOT EXISTS users (
                    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    username      VARCHAR(64)  UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    name          VARCHAR(128) NOT NULL,
                    role          VARCHAR(64)  NOT NULL DEFAULT 'user',
                    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
                    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                    last_login_at TIMESTAMPTZ
                )
            """))
            # Upsert: the bootstrap admin's password tracks ADMIN_PASSWORD, so
            # changing it in the server .env and redeploying updates the account
            # (the password is config-managed, not hand-edited in the DB).
            await conn.execute(
                _sql_text("""
                    INSERT INTO users (username, password_hash, name, role)
                    VALUES (:u, :p, :n, 'admin')
                    ON CONFLICT (username) DO UPDATE
                        SET password_hash = EXCLUDED.password_hash,
                            name = EXCLUDED.name,
                            is_active = TRUE
                """),
                {
                    "u": settings.ADMIN_USERNAME,
                    "p": hash_password(settings.ADMIN_PASSWORD),
                    "n": settings.ADMIN_NAME,
                },
            )
        log.info("[%s] auth: bootstrap admin ensured (username=%s)",
                 settings.SERVICE_NAME, settings.ADMIN_USERNAME)
    except Exception as exc:  # noqa: BLE001
        log.warning("[%s] auth: admin seed skipped: %s", settings.SERVICE_NAME, exc)


app = FastAPI(
    title="Atlas Vision & RAG API",
    version="2.0.0",
    lifespan=lifespan,
)

_default_origins = [
    *[f"http://localhost:{p}" for p in range(5173, 5185)],
    *[f"http://127.0.0.1:{p}" for p in range(5173, 5185)],
]
# Production origins (https://www.example.com, https://example.com, …) come from
# ALLOWED_ORIGINS (comma-separated). Defaults keep local dev working.
_extra_origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Prometheus metrics (FastAPI equivalent of SpringBoot Actuator) ────────────
# Exposes /metrics with per-endpoint latency/throughput. Optional: the app runs
# unchanged if prometheus-fastapi-instrumentator is not installed.
if settings.METRICS_ENABLED:
    try:
        from prometheus_fastapi_instrumentator import Instrumentator

        Instrumentator(
            should_group_status_codes=True,
            excluded_handlers=["/health", "/metrics"],
        ).instrument(app).expose(app, include_in_schema=False, endpoint="/metrics")
        logging.getLogger(__name__).info("[%s] /metrics enabled", settings.SERVICE_NAME)
    except Exception as exc:  # pragma: no cover - optional dependency
        logging.getLogger(__name__).warning("metrics disabled: %s", exc)

# Auth endpoints are PUBLIC (login/refresh/logout); /auth/me self-protects.
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])

# The embedding service is called server-to-server by rag/agent (via
# EMBEDDING_SERVICE_URL) WITHOUT a user token, so it stays ungated.
app.include_router(embeddings_router, prefix="/api/embeddings", tags=["embeddings"])

# All user-facing business endpoints require a valid access token.
_PROTECTED = [Depends(get_current_user)]
app.include_router(rag_router, prefix="/api/rag", tags=["rag"], dependencies=_PROTECTED)
app.include_router(files_router, prefix="/api/files", tags=["files"], dependencies=_PROTECTED)
app.include_router(documents_router, prefix="/api/documents", tags=["documents"], dependencies=_PROTECTED)
app.include_router(chunks_router, prefix="/api/chunks", tags=["chunks"], dependencies=_PROTECTED)
app.include_router(vector_router, prefix="/api/vector", tags=["vector"], dependencies=_PROTECTED)
app.include_router(retrieval_router, prefix="/api/retrieval", tags=["retrieval"], dependencies=_PROTECTED)
app.include_router(chat_router, prefix="/api/rag", tags=["rag-chat"], dependencies=_PROTECTED)
app.include_router(chat_stream_router, prefix="/api/chat", tags=["chat"], dependencies=_PROTECTED)
app.include_router(agent_router, prefix="/api/agent", tags=["agent"], dependencies=_PROTECTED)
app.include_router(media_router, prefix="/api/media", tags=["media"], dependencies=_PROTECTED)


@app.get("/health", tags=["infra"])
async def health() -> dict:
    return {
        "status": "ok",
        "service": settings.SERVICE_NAME,
        "version": "2.0.0",
        "mode": "remote" if settings.EMBEDDING_SERVICE_URL else "local-embeddings",
    }
