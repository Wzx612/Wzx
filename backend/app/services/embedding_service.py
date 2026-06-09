"""EmbeddingService — BGE Large Chinese (bge-large-zh-v1.5, dim=1024).

Batch processing with exponential-backoff retry.
Model is loaded once per process and cached as a class variable.

Topology-aware:
  - Local mode (default): loads the BGE model in-process. Used by the
    embedding-service container and by single-process dev / tests.
  - Remote mode (settings.EMBEDDING_SERVICE_URL set): never loads the model;
    proxies all embedding work to the embedding-service over HTTP. Used by
    rag-service and agent-service so the 1.3 GB model loads only once.

Query embeddings are optionally cached in Redis (fail-open).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from typing import TYPE_CHECKING

import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.knowledge_chunk import KnowledgeChunk

logger = logging.getLogger(__name__)

# sentence-transformers (and torch) are imported lazily inside get_model() so
# remote-mode services never pay the import cost. TYPE_CHECKING keeps the
# annotations valid for type-checkers without importing at runtime.
if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

# Redis is optional — caching is fail-open. Import guarded so the app runs
# even if the package is missing or REDIS_URL is unset.
try:
    from redis import asyncio as aioredis
except Exception:  # pragma: no cover - redis is an optional dependency
    aioredis = None

_redis_client = None
_redis_unavailable = False


# ── Pure helpers (no I/O) ────────────────────────────────────────────────────


def _vec_literal(embedding: list[float]) -> str:
    """Format float list as pgvector literal: '[0.12345678,...]'."""
    return "[" + ",".join(f"{v:.8f}" for v in embedding) + "]"


def _encode_sync(
    model: SentenceTransformer,
    texts: list[str],
) -> list[list[float]]:
    """Run model.encode in a thread — no async, no I/O."""
    vectors = model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        batch_size=len(texts),
    )
    return [v.tolist() for v in vectors]


# ── Service ──────────────────────────────────────────────────────────────────


class EmbeddingService:
    """Stateless embedding service backed by BGE Large Chinese."""

    MODEL_NAME = "BAAI/bge-large-zh-v1.5"
    BATCH_SIZE = 32
    MAX_RETRIES = 3
    RETRY_BASE_DELAY = 1.0  # seconds; doubles each attempt
    EMBEDDING_DIM = 1024

    _model: SentenceTransformer | None = None
    _lock: asyncio.Lock | None = None

    # ── model loading ────────────────────────────────────────────────────────

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._lock is None:
            cls._lock = asyncio.Lock()
        return cls._lock

    @classmethod
    async def get_model(cls) -> "SentenceTransformer":
        """Return the cached SentenceTransformer, loading it on first call.

        The heavy import happens here (not at module load) so remote-mode
        services that never call this stay lightweight.
        """
        async with cls._get_lock():
            if cls._model is None:
                from sentence_transformers import SentenceTransformer

                logger.info("Loading %s …", cls.MODEL_NAME)
                cls._model = await asyncio.to_thread(
                    SentenceTransformer, cls.MODEL_NAME
                )
                logger.info(
                    "Model ready — dim=%d", cls.EMBEDDING_DIM
                )
        return cls._model

    # ── public embedding API ─────────────────────────────────────────────────

    @classmethod
    async def generate_embedding(cls, text: str) -> list[float]:
        """Embed a single text string. Returns a 1024-dim unit vector.

        This is the query-embedding path (retrieval). Results are cached in
        Redis when REDIS_URL is configured — query embeddings are deterministic
        and frequently repeated, so caching saves both the BGE compute and (in
        remote mode) an HTTP round-trip. Caching is fail-open.
        """
        cached = await cls._cache_get(text)
        if cached is not None:
            return cached
        result = (await cls.generate_embeddings([text]))[0]
        await cls._cache_set(text, result)
        return result

    @classmethod
    async def generate_embeddings(cls, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts in batches with retry.

        Returns one 1024-dim unit vector per input text.
        In remote mode (EMBEDDING_SERVICE_URL set) this proxies to the
        embedding-service; otherwise it runs the local BGE model.
        Raises RuntimeError if all retry attempts fail.
        """
        if not texts:
            return []

        if settings.EMBEDDING_SERVICE_URL:
            return await cls._remote_embeddings(texts)

        model = await cls.get_model()
        all_vecs: list[list[float]] = []

        for offset in range(0, len(texts), cls.BATCH_SIZE):
            batch = texts[offset : offset + cls.BATCH_SIZE]
            vecs = await cls._encode_with_retry(model, batch)
            all_vecs.extend(vecs)

        return all_vecs

    # ── database integration ─────────────────────────────────────────────────

    @classmethod
    async def generate_for_document(
        cls,
        db: AsyncSession,
        document_id: str,
    ) -> int:
        """Generate and persist embeddings for all chunks of *document_id*.

        Replaces any existing embeddings for those chunks.
        Returns the number of embeddings written.

        In remote mode the work is delegated to the embedding-service, which
        reads the (already-committed) chunks from the shared database, embeds
        them, and writes knowledge_embeddings. The local *db* session is unused
        in that path.
        """
        if settings.EMBEDDING_SERVICE_URL:
            return await cls._remote_generate_for_document(document_id)

        chunks = (
            await db.execute(
                select(KnowledgeChunk)
                .where(KnowledgeChunk.document_id == document_id)
                .order_by(KnowledgeChunk.chunk_index)
            )
        ).scalars().all()

        if not chunks:
            return 0

        texts = [c.chunk_text for c in chunks]
        embeddings = await cls.generate_embeddings(texts)

        # Replace existing rows for this document's chunks
        chunk_id_list = ", ".join(f"'{c.id!s}'" for c in chunks)
        await db.execute(
            text(
                f"DELETE FROM knowledge_embeddings WHERE chunk_id IN ({chunk_id_list})"
            )
        )

        # Bulk insert — one row per chunk.
        # asyncpg rejects :param::type syntax; inline the vector literal and
        # use CAST for the UUID parameter.
        for chunk, emb in zip(chunks, embeddings):
            vec_str = _vec_literal(emb)
            await db.execute(
                text(f"""
                    INSERT INTO knowledge_embeddings (id, chunk_id, embedding)
                    VALUES (gen_random_uuid(), CAST(:cid AS uuid), '{vec_str}'::vector)
                """),
                {"cid": str(chunk.id)},
            )

        await db.commit()
        logger.info(
            "Saved %d embeddings for document %s", len(embeddings), document_id
        )
        return len(embeddings)

    # ── private helpers ──────────────────────────────────────────────────────

    @classmethod
    async def _encode_with_retry(
        cls,
        model: SentenceTransformer,
        texts: list[str],
    ) -> list[list[float]]:
        last_exc: Exception | None = None
        for attempt in range(cls.MAX_RETRIES):
            try:
                return await asyncio.to_thread(_encode_sync, model, texts)
            except Exception as exc:
                last_exc = exc
                if attempt < cls.MAX_RETRIES - 1:
                    delay = cls.RETRY_BASE_DELAY * (2**attempt)
                    logger.warning(
                        "Embedding attempt %d/%d failed: %s — retry in %.1fs",
                        attempt + 1,
                        cls.MAX_RETRIES,
                        exc,
                        delay,
                    )
                    await asyncio.sleep(delay)

        raise RuntimeError(
            f"Embedding failed after {cls.MAX_RETRIES} attempts"
        ) from last_exc

    # ── remote mode (proxy to embedding-service) ──────────────────────────────

    @classmethod
    async def _remote_embeddings(cls, texts: list[str]) -> list[list[float]]:
        """Proxy raw-text embedding to the embedding-service over HTTP.

        Retries with exponential backoff on transient network / 5xx errors so a
        brief embedding-service blip (e.g. during a rolling restart) doesn't
        fail the whole request.
        """
        url = settings.EMBEDDING_SERVICE_URL.rstrip("/") + "/api/embeddings/embed"
        last_exc: Exception | None = None
        async with httpx.AsyncClient(timeout=settings.EMBEDDING_HTTP_TIMEOUT) as client:
            for attempt in range(cls.MAX_RETRIES):
                try:
                    resp = await client.post(url, json={"texts": texts})
                    resp.raise_for_status()
                    return resp.json()["embeddings"]
                except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                    last_exc = exc
                    if attempt < cls.MAX_RETRIES - 1:
                        delay = cls.RETRY_BASE_DELAY * (2**attempt)
                        logger.warning(
                            "Remote embed attempt %d/%d failed: %s — retry in %.1fs",
                            attempt + 1, cls.MAX_RETRIES, exc, delay,
                        )
                        await asyncio.sleep(delay)
        raise RuntimeError(
            f"Remote embedding failed after {cls.MAX_RETRIES} attempts"
        ) from last_exc

    @classmethod
    async def _remote_generate_for_document(cls, document_id: str) -> int:
        """Ask the embedding-service to embed & persist a document's chunks."""
        url = (
            settings.EMBEDDING_SERVICE_URL.rstrip("/")
            + f"/api/embeddings/generate/{document_id}"
        )
        async with httpx.AsyncClient(timeout=settings.EMBEDDING_HTTP_TIMEOUT) as client:
            resp = await client.post(url)
            resp.raise_for_status()
            return int(resp.json()["chunkCount"])

    # ── Redis query-embedding cache (fail-open) ───────────────────────────────

    @classmethod
    async def _get_redis(cls):
        """Return a shared async Redis client, or None if unavailable/disabled."""
        global _redis_client, _redis_unavailable
        if not settings.REDIS_URL or aioredis is None or _redis_unavailable:
            return None
        if _redis_client is None:
            try:
                _redis_client = aioredis.from_url(
                    settings.REDIS_URL, encoding="utf-8", decode_responses=True
                )
            except Exception as exc:  # pragma: no cover - infra dependent
                logger.warning("Redis init failed (%s) — caching disabled", exc)
                _redis_unavailable = True
                return None
        return _redis_client

    @classmethod
    def _cache_key(cls, text: str) -> str:
        digest = hashlib.sha256(
            f"{cls.MODEL_NAME}\x00{text}".encode("utf-8")
        ).hexdigest()
        return f"emb:{digest}"

    @classmethod
    async def _cache_get(cls, text: str) -> list[float] | None:
        client = await cls._get_redis()
        if client is None:
            return None
        try:
            raw = await client.get(cls._cache_key(text))
            return json.loads(raw) if raw else None
        except Exception as exc:  # pragma: no cover - infra dependent
            logger.debug("Redis get failed (%s) — skipping cache", exc)
            return None

    @classmethod
    async def _cache_set(cls, text: str, vec: list[float]) -> None:
        client = await cls._get_redis()
        if client is None:
            return
        try:
            await client.set(
                cls._cache_key(text),
                json.dumps(vec),
                ex=settings.EMBEDDING_CACHE_TTL,
            )
        except Exception as exc:  # pragma: no cover - infra dependent
            logger.debug("Redis set failed (%s) — skipping cache", exc)
