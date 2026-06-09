"""POST /api/multimodal/upload — image upload → knowledge base indexing."""

import logging
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.multimodal_service import MultimodalIndexService

logger = logging.getLogger(__name__)
router = APIRouter()

# Accepted MIME types: PNG, JPG/JPEG, WEBP
_ALLOWED = {"image/jpeg", "image/png", "image/webp"}
_MAX_BYTES = 20 * 1024 * 1024  # 20 MB

# Magic-byte signatures for basic content validation
_MAGIC: dict[str, list[bytes]] = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png":  [b"\x89PNG"],
    "image/webp": [b"RIFF"],
}


def _check_magic(data: bytes, content_type: str) -> None:
    sigs = _MAGIC.get(content_type, [])
    if sigs and not any(data[: len(s)] == s for s in sigs):
        raise HTTPException(
            status_code=422,
            detail="File content does not match declared type",
        )


# ── Response schemas ──────────────────────────────────────────────────────────


class AnalysisOut(BaseModel):
    summary: str
    objects: list[str]
    texts: list[str]
    scene: str
    style: str
    tags: list[str]


class MultimodalUploadResponse(BaseModel):
    document_id: str
    image_url: str
    minio_path: str
    file_name: str
    file_type: str
    file_size: int
    analysis: AnalysisOut
    chunk_count: int
    embedding_count: int


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.post(
    "/upload",
    response_model=MultimodalUploadResponse,
    status_code=201,
    summary="Upload image → Qwen-VL analysis → knowledge base indexing",
)
async def upload_image(
    file: Annotated[UploadFile, File(description="PNG / JPG / JPEG / WEBP, max 20 MB")],
    db: AsyncSession = Depends(get_db),
) -> MultimodalUploadResponse:
    """Full multimodal RAG pipeline in one request.

    1. Validates image type and magic bytes.
    2. Uploads to MinIO (knowledge-images/ prefix).
    3. Calls Qwen-VL-Max for OCR, scene analysis, object detection, tag generation.
    4. Builds rich searchable text from the analysis.
    5. Chunks → BGE embeddings → stores in knowledge_embeddings.

    The image is now queryable via GET /api/retrieval/search or POST /api/agent/chat.
    """
    # ── Validate content type ─────────────────────────────────────────────
    ct = (file.content_type or "").lower()
    # Normalize: some clients send "image/jpg" instead of "image/jpeg"
    if ct == "image/jpg":
        ct = "image/jpeg"
    if ct not in _ALLOWED:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ct}'. Allowed: image/jpeg, image/png, image/webp",
        )

    # ── Read + size check ─────────────────────────────────────────────────
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes) // 1024} KB). Max 20 MB.",
        )
    if len(file_bytes) < 100:
        raise HTTPException(status_code=422, detail="File appears empty or corrupt")

    _check_magic(file_bytes, ct)

    filename = file.filename or f"upload.{ct.split('/')[1]}"

    # ── Full pipeline ─────────────────────────────────────────────────────
    try:
        result = await MultimodalIndexService.index_image(
            db=db,
            file_bytes=file_bytes,
            content_type=ct,
            filename=filename,
        )
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Vision analysis failed: {exc}",
        ) from exc

    return MultimodalUploadResponse(
        document_id=result.document_id,
        image_url=result.image_url,
        minio_path=result.minio_path,
        file_name=result.file_name,
        file_type=result.file_type,
        file_size=result.file_size,
        analysis=AnalysisOut(
            summary=result.analysis.summary,
            objects=result.analysis.objects,
            texts=result.analysis.texts,
            scene=result.analysis.scene,
            style=result.analysis.style,
            tags=result.analysis.tags,
        ),
        chunk_count=result.chunk_count,
        embedding_count=result.embedding_count,
    )
