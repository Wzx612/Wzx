"""VectorStoreService — pgvector operations over knowledge_embeddings (BGE 512-dim).

Three concerns:
  - write   : delegate to EmbeddingService, which already owns the INSERT logic
  - read    : fetch a single vector back as list[float]
  - search  : cosine similarity via pgvector <=> operator
  - index   : IVFFlat index lifecycle, auto-tuned to row count

asyncpg note:
  The driver rejects :param::type syntax because the double-colon immediately
  following a named parameter confuses the text-parameter parser.
  Fix: use CAST(:param AS type) for UUID params, and inline vector literals
  directly as SQL string literals (safe — _vec_literal only produces digits,
  dots, commas, brackets, and minus signs).
"""

import dataclasses
import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embedding_service import EmbeddingService, _vec_literal

logger = logging.getLogger(__name__)

_INDEX_NAME = "idx_ke_embedding"

# (minimum_rows, ivfflat_lists) — tried in order, first match wins
_INDEX_TIERS = [(300, 100), (150, 50), (30, 10)]


# ── Result type ───────────────────────────────────────────────────────────────


@dataclasses.dataclass
class SearchResult:
    chunk_id: str
    document_id: str
    chunk_index: int
    chunk_text: str
    similarity: float  # cosine similarity, 1.0 = identical


# ── Service ───────────────────────────────────────────────────────────────────


class VectorStoreService:
    """Stateless service — all methods take an AsyncSession as first argument."""

    # ── write ─────────────────────────────────────────────────────────────────

    @staticmethod
    async def write_embeddings(db: AsyncSession, document_id: str) -> int:
        """Generate and persist BGE embeddings for every chunk of *document_id*.

        Replaces existing embeddings for the same chunks.
        Returns the number of embeddings written.
        """
        return await EmbeddingService.generate_for_document(db, document_id)

    # ── read ──────────────────────────────────────────────────────────────────

    @staticmethod
    async def read_embedding(
        db: AsyncSession, chunk_id: str
    ) -> Optional[list[float]]:
        """Return the stored embedding vector for *chunk_id*, or None."""
        row = await db.execute(
            text("""
                SELECT embedding::text
                FROM knowledge_embeddings
                WHERE chunk_id = CAST(:cid AS uuid)
            """),
            {"cid": chunk_id},
        )
        val = row.scalar()
        if val is None:
            return None
        # pgvector text format: "[0.12345678,0.23456789,...]"
        return [float(x) for x in val[1:-1].split(",")]

    @staticmethod
    async def get_embedding_count(
        db: AsyncSession, document_id: Optional[str] = None
    ) -> int:
        """Count embeddings, optionally restricted to one document."""
        if document_id:
            result = await db.execute(
                text("""
                    SELECT COUNT(*)
                    FROM knowledge_embeddings ke
                    JOIN knowledge_chunks kc ON ke.chunk_id = kc.id
                    WHERE kc.document_id = CAST(:doc_id AS uuid)
                """),
                {"doc_id": document_id},
            )
        else:
            result = await db.execute(
                text("SELECT COUNT(*) FROM knowledge_embeddings")
            )
        return int(result.scalar() or 0)

    # ── similarity search ─────────────────────────────────────────────────────

    @staticmethod
    async def similarity_search(
        db: AsyncSession,
        query_embedding: list[float],
        top_k: int = 5,
        document_id: Optional[str] = None,
    ) -> list[SearchResult]:
        """Return the *top_k* most similar chunks, ranked by cosine similarity.

        Uses pgvector's <=> (cosine distance) operator.
        similarity = 1 − cosine_distance  ∈ [−1, 1]; higher is more similar.
        """
        q_vec = _vec_literal(query_embedding)

        if document_id:
            sql = text(f"""
                SELECT
                    ke.chunk_id::text,
                    kc.document_id::text,
                    kc.chunk_index,
                    kc.chunk_text,
                    1 - (ke.embedding <=> '{q_vec}'::vector) AS similarity
                FROM knowledge_embeddings ke
                JOIN knowledge_chunks kc ON ke.chunk_id = kc.id
                WHERE kc.document_id = CAST(:doc_id AS uuid)
                ORDER BY ke.embedding <=> '{q_vec}'::vector
                LIMIT :k
            """)
            result = await db.execute(sql, {"doc_id": document_id, "k": top_k})
        else:
            sql = text(f"""
                SELECT
                    ke.chunk_id::text,
                    kc.document_id::text,
                    kc.chunk_index,
                    kc.chunk_text,
                    1 - (ke.embedding <=> '{q_vec}'::vector) AS similarity
                FROM knowledge_embeddings ke
                JOIN knowledge_chunks kc ON ke.chunk_id = kc.id
                ORDER BY ke.embedding <=> '{q_vec}'::vector
                LIMIT :k
            """)
            result = await db.execute(sql, {"k": top_k})

        return [
            SearchResult(
                chunk_id=str(row[0]),
                document_id=str(row[1]),
                chunk_index=int(row[2]),
                chunk_text=str(row[3]),
                similarity=float(row[4]),
            )
            for row in result.fetchall()
        ]

    # ── index lifecycle ───────────────────────────────────────────────────────

    @staticmethod
    async def _index_exists(db: AsyncSession) -> bool:
        row = await db.execute(
            text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_indexes WHERE indexname = :name
                )
            """),
            {"name": _INDEX_NAME},
        )
        return bool(row.scalar())

    @staticmethod
    async def build_ivfflat_index(
        db: AsyncSession, *, force: bool = False
    ) -> bool:
        """Create (or recreate) the IVFFlat index when enough rows exist.

        lists count is auto-tuned to the current row count.
        Returns True if the index exists after the call, False if skipped.

        Keyword args:
            force — drop and recreate even when IF NOT EXISTS would be a no-op
        """
        count_row = await db.execute(
            text("SELECT COUNT(*) FROM knowledge_embeddings")
        )
        count = int(count_row.scalar() or 0)

        lists: Optional[int] = None
        for min_rows, n_lists in _INDEX_TIERS:
            if count >= min_rows:
                lists = n_lists
                break

        if lists is None:
            logger.info(
                "Skipping IVFFlat — %d rows (need ≥%d)", count, _INDEX_TIERS[-1][0]
            )
            return await VectorStoreService._index_exists(db)

        if force:
            await db.execute(text(f"DROP INDEX IF EXISTS {_INDEX_NAME}"))

        # lists value comes from our code, not user input — f-string is safe
        await db.execute(text(f"""
            CREATE INDEX IF NOT EXISTS {_INDEX_NAME}
            ON knowledge_embeddings USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = {lists})
        """))
        await db.commit()
        logger.info("IVFFlat index ready — lists=%d, total_rows=%d", lists, count)
        return True

    # ── pipeline ──────────────────────────────────────────────────────────────

    @staticmethod
    async def ensure_indexed(db: AsyncSession, document_id: str) -> dict:
        """End-to-end pipeline: embed missing chunks → build vector index.

        Idempotent — safe to call multiple times.
        Returns a stats dict suitable for the HTTP response.
        """
        chunk_count = int(
            (
                await db.execute(
                    text("""
                        SELECT COUNT(*) FROM knowledge_chunks
                        WHERE document_id = CAST(:doc_id AS uuid)
                    """),
                    {"doc_id": document_id},
                )
            ).scalar()
            or 0
        )
        embedding_count = await VectorStoreService.get_embedding_count(
            db, document_id
        )

        if embedding_count < chunk_count:
            embedding_count = await EmbeddingService.generate_for_document(
                db, document_id
            )

        indexed = await VectorStoreService.build_ivfflat_index(db)

        return {
            "document_id": document_id,
            "embeddingCount": int(embedding_count),
            "chunkCount": int(chunk_count),
            "indexed": indexed,
        }
