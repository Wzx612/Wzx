"""Document parsing API."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from app.core.database import get_db
from app.models.document_content import DocumentContent
from app.models.knowledge_document import KnowledgeDocument
from app.services.file_service import FileService
from app.services.pdf_parser import DocumentParser

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/parse/{file_id}")
async def parse_document(
    file_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Parse a previously uploaded PDF and store its full text.

    Returns total page count and character count.
    Re-parsing the same document overwrites the previous result.
    """
    row = (
        await db.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.id == file_id)
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if row.file_type.lower() != "pdf":
        raise HTTPException(
            status_code=422,
            detail=f"Only PDF files can be parsed (got '{row.file_type}')",
        )

    try:
        file_bytes = FileService.download_object(row.minio_path)
    except Exception as exc:
        logger.exception("MinIO download failed for %s", row.minio_path)
        raise HTTPException(status_code=503, detail=f"Storage error: {exc}") from exc

    try:
        result = DocumentParser.parse_pdf(file_bytes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"PDF parse error: {exc}") from exc

    stmt = (
        pg_insert(DocumentContent)
        .values(
            document_id=row.id,
            content=result.text,
            page_count=result.pages,
            char_count=result.characters,
        )
        .on_conflict_do_update(
            constraint="uq_document_content_doc_id",
            set_={
                "content": result.text,
                "page_count": result.pages,
                "char_count": result.characters,
                "parsed_at": func.now(),
            },
        )
    )
    await db.execute(stmt)
    await db.commit()

    logger.info(
        "Parsed %s — %d pages, %d chars", row.file_name, result.pages, result.characters
    )
    return {"pages": result.pages, "characters": result.characters}
