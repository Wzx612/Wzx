from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_document import KnowledgeDocument
from app.services.vector_store_service import VectorStoreService

router = APIRouter()


@router.post("/index/{document_id}", status_code=200)
async def index_document(
    document_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Ensure all chunks are embedded and the IVFFlat index is ready.

    Pipeline:
      1. Verify document exists.
      2. Verify chunks exist (must run chunk generation first).
      3. Generate any missing embeddings via BGE.
      4. Build or update the IVFFlat index when row count is sufficient.

    Returns:
        document_id, embeddingCount, chunkCount, indexed (bool)
    """
    doc = await db.scalar(
        select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
    )
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    has_chunks = await db.scalar(
        select(KnowledgeChunk.id)
        .where(KnowledgeChunk.document_id == document_id)
        .limit(1)
    )
    if has_chunks is None:
        raise HTTPException(
            status_code=422,
            detail="No chunks found — run chunk generation first",
        )

    return await VectorStoreService.ensure_indexed(db, document_id)
