"""Vision API — POST /api/vision/analyze, GET /api/vision/history"""

import logging
import math
import time
from collections import defaultdict
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from minio.error import S3Error
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.minio_client import ALLOWED_CONTENT_TYPES, upload_image
from app.models.image_analysis import ImageAnalysisRecord
from app.schemas.vision import AnalysisRecord, PaginatedHistory, VisionResponse
from app.services.vision_service import get_vision_service

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Simple in-memory rate limiter (IP → [(timestamp, count)]) ────────────────
_rate_store: dict[str, list[float]] = defaultdict(list)


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    window = 60.0
    _rate_store[ip] = [t for t in _rate_store[ip] if now - t < window]
    if len(_rate_store[ip]) >= settings.RATE_LIMIT_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded: max {settings.RATE_LIMIT_PER_MINUTE} requests/minute",
        )
    _rate_store[ip].append(now)


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── File validation ──────────────────────────────────────────────────────────

ALLOWED_MIME_TYPES = ALLOWED_CONTENT_TYPES
MAX_BYTES = settings.MAX_FILE_SIZE_MB * 1024 * 1024


def _validate_file(file: UploadFile) -> None:
    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: jpg, png, webp",
        )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/analyze", response_model=VisionResponse, status_code=200)
async def analyze_image(
    request: Request,
    file: Annotated[UploadFile, File(description="Image file (jpg/png/webp, max 10 MB)")],
    db: AsyncSession = Depends(get_db),
) -> VisionResponse:
    """Upload an image and run Qwen-VL-Max analysis on it."""

    _check_rate_limit(_get_client_ip(request))
    _validate_file(file)

    # Read and size-check
    file_bytes = await file.read()
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes)//1024} KB). Max {settings.MAX_FILE_SIZE_MB} MB.",
        )
    if len(file_bytes) < 100:
        raise HTTPException(status_code=422, detail="File appears to be empty or corrupt.")

    # Detect malicious files: check magic bytes
    _check_magic_bytes(file_bytes, file.content_type or "")

    # Upload to MinIO
    try:
        image_url = upload_image(file_bytes, file.content_type or "image/jpeg")
    except S3Error as exc:
        logger.error("MinIO upload failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Storage service unavailable: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=str(exc)) from exc

    # Create DB record (pending)
    record = ImageAnalysisRecord(
        image_url=image_url,
        original_filename=file.filename or "upload",
        file_size=len(file_bytes),
        status="pending",
    )
    db.add(record)
    await db.flush()

    # Run vision analysis
    vision_svc = get_vision_service()
    try:
        result, token_in, token_out, latency = await vision_svc.analyze_image(image_url)
    except httpx.HTTPStatusError as exc:
        record.status = "error"
        record.error_message = str(exc)
        await db.commit()
        raise HTTPException(status_code=502, detail=f"AI analysis failed: {exc}") from exc
    except Exception as exc:
        record.status = "error"
        record.error_message = str(exc)
        await db.commit()
        logger.exception("Unexpected vision service error")
        raise HTTPException(status_code=502, detail="AI analysis failed unexpectedly") from exc

    # Persist results
    record.summary = result.summary
    record.analysis_result = result.model_dump()
    record.token_input = token_in
    record.token_output = token_out
    record.latency_ms = latency
    record.status = "done"
    await db.commit()
    await db.refresh(record)

    return VisionResponse(
        id=str(record.id),
        image_url=record.image_url,
        original_filename=record.original_filename,
        result=result,
        latency_ms=latency,
        token_input=token_in,
        token_output=token_out,
        created_at=record.created_at,
    )


@router.get("/history", response_model=PaginatedHistory)
async def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> PaginatedHistory:
    """Return paginated analysis history."""
    offset = (page - 1) * page_size

    total_result = await db.execute(
        select(func.count()).select_from(ImageAnalysisRecord)
    )
    total: int = total_result.scalar_one()

    rows_result = await db.execute(
        select(ImageAnalysisRecord)
        .where(ImageAnalysisRecord.status == "done")
        .order_by(ImageAnalysisRecord.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = rows_result.scalars().all()

    items = [
        AnalysisRecord(
            id=str(r.id),
            image_url=r.image_url,
            original_filename=r.original_filename,
            summary=r.summary or "",
            tags=(r.analysis_result or {}).get("tags", []),
            created_at=r.created_at,
            status=r.status,
            latency_ms=r.latency_ms,
        )
        for r in rows
    ]

    return PaginatedHistory(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/history/{record_id}", response_model=VisionResponse)
async def get_record(
    record_id: str,
    db: AsyncSession = Depends(get_db),
) -> VisionResponse:
    """Return full analysis result for a single record."""
    result = await db.execute(
        select(ImageAnalysisRecord).where(
            ImageAnalysisRecord.id == record_id  # type: ignore[arg-type]
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Record not found")
    if record.status != "done" or not record.analysis_result:
        raise HTTPException(status_code=422, detail="Analysis not complete")

    from app.schemas.vision import AnalysisResult
    return VisionResponse(
        id=str(record.id),
        image_url=record.image_url,
        original_filename=record.original_filename,
        result=AnalysisResult(**record.analysis_result),
        latency_ms=record.latency_ms or 0,
        token_input=record.token_input or 0,
        token_output=record.token_output or 0,
        created_at=record.created_at,
    )


# ── Security helpers ─────────────────────────────────────────────────────────

_MAGIC = {
    "image/jpeg": [b"\xff\xd8\xff"],
    "image/png":  [b"\x89PNG"],
    "image/webp": [b"RIFF"],
}


def _check_magic_bytes(data: bytes, content_type: str) -> None:
    """Verify file magic bytes match declared content type."""
    signatures = _MAGIC.get(content_type, [])
    for sig in signatures:
        if data[:len(sig)] == sig:
            return
    if signatures:
        raise HTTPException(
            status_code=422,
            detail="File content does not match declared type (possible malicious upload)",
        )
