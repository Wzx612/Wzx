"""RetrievalService — semantic retrieval over knowledge_embeddings.

Flow: query text → BGE embedding → pgvector cosine search → threshold filter → RetrievalChunk list

Design notes:
  - Uses the same _vec_literal / inline-SQL-literal pattern as VectorStoreService
    to avoid the asyncpg :param::type incompatibility.
  - CAST(:param AS uuid) is used for the document_id bound parameter.
  - Hybrid search is reserved (mode="hybrid" falls back to semantic with a warning).
"""

import dataclasses
import logging
from typing import Literal, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embedding_service import EmbeddingService, _vec_literal

logger = logging.getLogger(__name__)


# ── Result type ───────────────────────────────────────────────────────────────


@dataclasses.dataclass
class RetrievalChunk:
    chunk_id: str
    document_id: str
    file_name: str      # citation source — filename from knowledge_documents
    chunk_index: int    # position within the document
    chunk_text: str
    similarity: float   # cosine similarity ∈ [-1, 1]; higher is more similar


# ── Service ───────────────────────────────────────────────────────────────────


class RetrievalService:
    DEFAULT_TOP_K = 5
    DEFAULT_MIN_SIMILARITY = 0.0

    @staticmethod
    async def retrieve(
        db: AsyncSession,
        query: str,
        top_k: int = DEFAULT_TOP_K,
        min_similarity: float = DEFAULT_MIN_SIMILARITY,
        document_id: Optional[str] = None,
        mode: Literal["semantic", "hybrid"] = "semantic",
    ) -> list[RetrievalChunk]:
        """Semantic retrieval pipeline.

        Steps:
          1. Embed the query with BGE.
          2. Run approximate nearest-neighbour search via pgvector <=> operator.
          3. Filter results below *min_similarity*.
          4. Return up to *top_k* ranked chunks with citation metadata.

        Args:
            query:          Natural language query (Chinese or English).
            top_k:          Maximum number of results.
            min_similarity: Cosine similarity threshold; results below this are
                            dropped.  0.0 means no filtering.
            document_id:    Restrict search to a specific document.
            mode:           "semantic" (current) or "hybrid" (reserved — falls
                            back to semantic until BM25 integration is added).
        """
        if mode == "hybrid":
            logger.warning(
                "Hybrid search is not yet implemented — using semantic search"
            )

        query_embedding = await EmbeddingService.generate_embedding(query)
        return await RetrievalService._semantic_search(
            db, query_embedding, top_k, min_similarity, document_id
        )

    # ── internals ─────────────────────────────────────────────────────────────

    @staticmethod
    async def _semantic_search(
        db: AsyncSession,
        query_embedding: list[float],
        top_k: int,
        min_similarity: float,
        document_id: Optional[str],
    ) -> list[RetrievalChunk]:
        """Cosine similarity search with citation join.

        Joins knowledge_documents to include file_name (citation source).
        Vector literal is inlined (safe: only digits, dots, commas, brackets,
        minus) to avoid asyncpg :param::vector parsing issues.
        """
        q_vec = _vec_literal(query_embedding)

        if document_id:
            sql = text(f"""
                SELECT
                    ke.chunk_id::text,
                    kc.document_id::text,
                    kd.file_name,
                    kc.chunk_index,
                    kc.chunk_text,
                    1 - (ke.embedding <=> '{q_vec}'::vector) AS similarity
                FROM knowledge_embeddings ke
                JOIN knowledge_chunks kc ON ke.chunk_id = kc.id
                JOIN knowledge_documents kd ON kc.document_id = kd.id
                WHERE kc.document_id = CAST(:doc_id AS uuid)
                ORDER BY ke.embedding <=> '{q_vec}'::vector
                LIMIT :top_k
            """)
            params = {"doc_id": document_id, "top_k": top_k}
        else:
            sql = text(f"""
                SELECT
                    ke.chunk_id::text,
                    kc.document_id::text,
                    kd.file_name,
                    kc.chunk_index,
                    kc.chunk_text,
                    1 - (ke.embedding <=> '{q_vec}'::vector) AS similarity
                FROM knowledge_embeddings ke
                JOIN knowledge_chunks kc ON ke.chunk_id = kc.id
                JOIN knowledge_documents kd ON kc.document_id = kd.id
                ORDER BY ke.embedding <=> '{q_vec}'::vector
                LIMIT :top_k
            """)
            params = {"top_k": top_k}

        result = await db.execute(sql, params)

        chunks = [
            RetrievalChunk(
                chunk_id=str(row[0]),
                document_id=str(row[1]),
                file_name=str(row[2]),
                chunk_index=int(row[3]),
                chunk_text=str(row[4]),
                similarity=float(row[5]),
            )
            for row in result.fetchall()
        ]

        # Post-fetch threshold filter (preserves pgvector index efficiency —
        # the ORDER BY <=> LIMIT path uses the IVFFlat index, then we trim).
        if min_similarity > 0.0:
            chunks = [c for c in chunks if c.similarity >= min_similarity]

        return chunks
