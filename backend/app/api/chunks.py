"""Chunk generation API."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.document_content import DocumentContent
from app.models.knowledge_document import KnowledgeDocument
from app.services.chunk_service import ChunkService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/generate/{document_id}")
async def generate_chunks(
    document_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Split a parsed document into chunks and persist them.

    Requires the document to have been parsed first
    (POST /api/documents/parse/{id}).
    Re-calling this endpoint replaces the previous chunks.
    """
    doc = (
        await db.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.id == document_id)
        )
    ).scalar_one_or_none()

    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    content_row = (
        await db.execute(
            select(DocumentContent).where(
                DocumentContent.document_id == document_id
            )
        )
    ).scalar_one_or_none()

    if content_row is None:
        raise HTTPException(
            status_code=422,
            detail="Document has not been parsed yet — call POST /api/documents/parse/{id} first",
        )

    if not content_row.content or not content_row.content.strip():
        raise HTTPException(
            status_code=422,
            detail="Parsed document content is empty — nothing to chunk",
        )

    try:
        count = await ChunkService.generate_chunks(
            db, document_id, content_row.content
        )
    except Exception as exc:
        logger.exception("Chunk generation failed for %s", document_id)
        raise HTTPException(
            status_code=500, detail=f"Chunk generation error: {exc}"
        ) from exc

    logger.info("Document %s → %d chunks (%s)", document_id, count, doc.file_name)
    return {"chunkCount": count}
