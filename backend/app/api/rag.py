"""RAG API endpoints."""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.minio_client import upload_image
from app.models.document import Document
from app.schemas.rag import DocumentListResponse, DocumentOut, RAGQueryRequest
from app.services import chunker, document_parser, embedder, vector_store
from app.services.rag_service import rag_stream

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".xlsx", ".xls",
    ".pptx", ".ppt", ".md", ".markdown",
    ".py", ".js", ".ts", ".tsx", ".jsx",
    ".java", ".go", ".rs", ".cpp", ".c",
    ".txt", ".json", ".yaml", ".yml",
}
MAX_BYTES = 50 * 1024 * 1024  # 50 MB for documents


# ── Document upload ──────────────────────────────────────────

@router.post("/documents", response_model=DocumentOut, status_code=202)
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: Annotated[UploadFile, File()],
    db: AsyncSession = Depends(get_db),
) -> DocumentOut:
    """Upload a document and start async processing pipeline."""
    from pathlib import Path

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{suffix}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB)")
    if len(file_bytes) < 10:
        raise HTTPException(status_code=422, detail="File appears empty")

    file_type = document_parser.detect_file_type(file.filename or "")

    # Store raw file in MinIO under docs/ prefix
    minio_key = f"docs/{uuid.uuid4()}{suffix}"
    try:
        from app.core.minio_client import get_minio_client, ensure_bucket
        import io as _io
        client = get_minio_client()
        ensure_bucket()
        client.put_object(
            settings.MINIO_BUCKET,
            minio_key,
            _io.BytesIO(file_bytes),
            length=len(file_bytes),
            content_type="application/octet-stream",
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Storage unavailable: {exc}") from exc

    doc = Document(
        filename=file.filename or "upload",
        file_type=file_type,
        minio_key=minio_key,
        file_size=len(file_bytes),
        status="processing",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    # Process in background
    background_tasks.add_task(
        _process_document,
        doc_id=str(doc.id),
        file_bytes=file_bytes,
        filename=file.filename or "upload",
    )

    return DocumentOut.model_validate(doc)


async def _process_document(doc_id: str, file_bytes: bytes, filename: str) -> None:
    """Background task: parse → chunk → embed → store."""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        try:
            # Parse
            text_content, _ = document_parser.parse_document(file_bytes, filename)
            if not text_content.strip():
                raise ValueError("Document appears to be empty or unreadable")

            # Chunk
            raw_chunks = chunker.split_text(text_content)
            chunk_dicts = [
                {"content": c, "index": i, "metadata": {"source": filename}}
                for i, c in enumerate(raw_chunks)
            ]

            if not chunk_dicts:
                raise ValueError("No text chunks extracted from document")

            # Embed (in batches)
            texts = [c["content"] for c in chunk_dicts]
            embeddings = await embedder.embed_texts(texts, text_type="document")

            # Store chunks + embeddings
            count = await vector_store.insert_chunks(db, doc_id, chunk_dicts, embeddings)

            # Update document status
            result = await db.execute(select(Document).where(Document.id == doc_id))
            doc = result.scalar_one_or_none()
            if doc:
                doc.status = "ready"
                doc.chunk_count = count
                await db.commit()

            logger.info("Processed document %s: %d chunks", doc_id, count)

        except Exception as exc:
            logger.exception("Document processing failed for %s", doc_id)
            try:
                # The session is in a failed transaction after the error; roll
                # back before issuing the status-update query, otherwise it too
                # fails and the document is left stuck in 'processing'.
                await db.rollback()
                result = await db.execute(select(Document).where(Document.id == doc_id))
                doc = result.scalar_one_or_none()
                if doc:
                    doc.status = "error"
                    doc.error_message = str(exc)[:500]
                    await db.commit()
            except Exception:
                logger.exception("Failed to mark document %s as error", doc_id)


# ── Document list & delete ───────────────────────────────────

@router.get("/documents", response_model=DocumentListResponse)
async def list_documents(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    total_res = await db.execute(select(func.count()).select_from(Document))
    total: int = total_res.scalar_one()

    docs_res = await db.execute(
        select(Document)
        .order_by(Document.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    docs = docs_res.scalars().all()
    return DocumentListResponse(
        items=[DocumentOut.model_validate(d) for d in docs],
        total=total,
    )


@router.delete("/documents/{doc_id}", status_code=204)
async def delete_document(doc_id: str, db: AsyncSession = Depends(get_db)) -> None:
    res = await db.execute(select(Document).where(Document.id == doc_id))
    doc = res.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    await vector_store.delete_document_chunks(db, doc_id)
    await db.delete(doc)
    await db.commit()


# ── RAG query (streaming SSE) ────────────────────────────────

@router.post("/query")
async def rag_query(
    body: RAGQueryRequest,
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Stream RAG pipeline results as SSE."""

    async def event_stream():
        async for chunk in rag_stream(
            query=body.query,
            db=db,
            top_k=body.top_k,
            document_ids=body.document_ids,
            deepseek_api_key=settings.DEEPSEEK_API_KEY,
        ):
            yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
