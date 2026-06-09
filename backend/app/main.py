import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text as _sql_text

from app.core.config import settings
from app.api.vision import router as vision_router
from app.api.rag import router as rag_router
from app.api.files import router as files_router
from app.api.documents import router as documents_router
from app.api.chunks import router as chunks_router
from app.api.embeddings import router as embeddings_router
from app.api.vector import router as vector_router
from app.api.retrieval import router as retrieval_router
from app.api.chat import router as chat_router
from app.api.agent import router as agent_router
from app.api.multimodal import router as multimodal_router

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
    yield


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

app.include_router(vision_router, prefix="/api/vision", tags=["vision"])
app.include_router(rag_router, prefix="/api/rag", tags=["rag"])
app.include_router(files_router, prefix="/api/files", tags=["files"])
app.include_router(documents_router, prefix="/api/documents", tags=["documents"])
app.include_router(chunks_router, prefix="/api/chunks", tags=["chunks"])
app.include_router(embeddings_router, prefix="/api/embeddings", tags=["embeddings"])
app.include_router(vector_router, prefix="/api/vector", tags=["vector"])
app.include_router(retrieval_router, prefix="/api/retrieval", tags=["retrieval"])
app.include_router(chat_router, prefix="/api/rag", tags=["rag-chat"])
app.include_router(agent_router, prefix="/api/agent", tags=["agent"])
app.include_router(multimodal_router, prefix="/api/multimodal", tags=["multimodal"])


@app.get("/health", tags=["infra"])
async def health() -> dict:
    return {
        "status": "ok",
        "service": settings.SERVICE_NAME,
        "version": "2.0.0",
        "mode": "remote" if settings.EMBEDDING_SERVICE_URL else "local-embeddings",
    }
