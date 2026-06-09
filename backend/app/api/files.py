"""File upload / management API."""

import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.knowledge_document import KnowledgeDocument
from app.schemas.files import FileListResponse, FileOut
from app.services.file_service import ALLOWED_EXTENSIONS, MAX_BYTES, FileService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/upload", response_model=FileOut, status_code=201)
async def upload_file(
    file: Annotated[UploadFile, File()],
    db: AsyncSession = Depends(get_db),
) -> FileOut:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported type '{suffix}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")
    if len(data) == 0:
        raise HTTPException(status_code=422, detail="File is empty")

    try:
        doc = await FileService.upload(db, data, file.filename or "upload")
    except Exception as exc:
        logger.exception("File upload failed")
        raise HTTPException(status_code=503, detail=f"Storage error: {exc}") from exc

    return FileOut.model_validate(doc)


@router.get("", response_model=FileListResponse)
async def list_files(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> FileListResponse:
    items, total = await FileService.list_files(db, page, page_size)
    return FileListResponse(
        items=[FileOut.model_validate(d) for d in items],
        total=total,
    )


@router.delete("/{file_id}", status_code=204)
async def delete_file(
    file_id: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    try:
        await FileService.delete(db, file_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("File delete failed for %s", file_id)
        raise HTTPException(status_code=503, detail=f"Delete error: {exc}") from exc


@router.get("/{file_id}/download")
async def get_download_url(
    file_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    row = (
        await db.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.id == file_id)
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="File not found")

    try:
        url = FileService.presigned_download_url(row.minio_path, row.file_name)
    except Exception as exc:
        logger.exception("Presign failed for %s", file_id)
        raise HTTPException(status_code=503, detail=f"Storage error: {exc}") from exc

    return {"url": url, "file_name": row.file_name}
