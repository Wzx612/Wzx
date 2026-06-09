"""pgvector CRUD — raw SQL to avoid asyncpg codec registration complexity."""

import json
import logging
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


def _vec_literal(embedding: list[float]) -> str:
    """Format a float list as pgvector literal string e.g. '[0.1,0.2,...]'."""
    return "[" + ",".join(f"{v:.8f}" for v in embedding) + "]"


async def insert_chunks(
    db: AsyncSession,
    document_id: str,
    chunks: list[dict[str, Any]],
    embeddings: list[list[float]],
) -> int:
    """Bulk-insert chunks with their embeddings. Returns inserted count."""
    assert len(chunks) == len(embeddings)
    count = 0
    for chunk, emb in zip(chunks, embeddings):
        chunk_id = str(uuid.uuid4())
        # asyncpg rejects the ':param::type' shorthand, so the vector literal is
        # inlined (safe: digits/dots/commas/brackets/minus only) and typed params
        # use CAST(...). Mirrors retrieval_service / embedding_service.
        vec = _vec_literal(emb)
        await db.execute(
            text(f"""
                INSERT INTO document_chunks
                    (id, document_id, content, chunk_index, metadata, embedding)
                VALUES
                    (CAST(:id AS uuid), CAST(:doc_id AS uuid), :content, :idx,
                     CAST(:meta AS jsonb), '{vec}'::vector)
            """),
            {
                "id": chunk_id,
                "doc_id": document_id,
                "content": chunk["content"],
                "idx": chunk["index"],
                "meta": json.dumps(chunk.get("metadata", {})),
            },
        )
        count += 1
    return count


async def similarity_search(
    db: AsyncSession,
    query_embedding: list[float],
    top_k: int = 5,
    document_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Cosine similarity search over document_chunks. Returns top_k rows."""
    emb_str = _vec_literal(query_embedding)

    doc_filter = ""
    params: dict[str, Any] = {"k": top_k}

    if document_ids:
        placeholders = ", ".join(f":doc_{i}" for i in range(len(document_ids)))
        doc_filter = f"AND dc.document_id::text IN ({placeholders})"
        for i, did in enumerate(document_ids):
            params[f"doc_{i}"] = did

    # Vector literal inlined (asyncpg ':param::type' incompatibility).
    stmt = text(f"""
        SELECT
            dc.id::text           AS chunk_id,
            dc.document_id::text  AS document_id,
            dc.content,
            dc.chunk_index,
            dc.metadata,
            d.filename,
            1 - (dc.embedding <=> '{emb_str}'::vector) AS similarity
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.status = 'ready'
          AND dc.embedding IS NOT NULL
          {doc_filter}
        ORDER BY dc.embedding <=> '{emb_str}'::vector
        LIMIT :k
    """)

    result = await db.execute(stmt, params)
    rows = result.fetchall()

    return [
        {
            "chunk_id": r.chunk_id,
            "document_id": r.document_id,
            "content": r.content,
            "chunk_index": r.chunk_index,
            "metadata": r.metadata if isinstance(r.metadata, dict) else json.loads(r.metadata or "{}"),
            "filename": r.filename,
            "similarity": float(r.similarity),
        }
        for r in rows
    ]


async def delete_document_chunks(db: AsyncSession, document_id: str) -> None:
    await db.execute(
        text("DELETE FROM document_chunks WHERE document_id = :doc_id"),
        {"doc_id": document_id},
    )
