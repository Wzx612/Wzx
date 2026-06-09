import io
import logging
import uuid
from datetime import timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.minio_client import ensure_bucket, get_minio_client
from app.models.knowledge_document import KnowledgeDocument

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".doc",
    ".xlsx", ".xls",
    ".pptx", ".ppt",
    ".txt", ".md", ".markdown",
}

MAX_BYTES = 50 * 1024 * 1024  # 50 MB

_CONTENT_TYPES: dict[str, str] = {
    ".pdf":      "application/pdf",
    ".docx":     "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc":      "application/msword",
    ".xlsx":     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls":      "application/vnd.ms-excel",
    ".pptx":     "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt":      "application/vnd.ms-powerpoint",
    ".txt":      "text/plain",
    ".md":       "text/markdown",
    ".markdown": "text/markdown",
}


class FileService:
    @staticmethod
    async def upload(
        db: AsyncSession,
        file_bytes: bytes,
        filename: str,
    ) -> KnowledgeDocument:
        suffix = Path(filename).suffix.lower()
        file_type = suffix.lstrip(".")
        minio_path = f"files/{uuid.uuid4()}{suffix}"
        content_type = _CONTENT_TYPES.get(suffix, "application/octet-stream")

        client = get_minio_client()
        ensure_bucket()
        client.put_object(
            settings.MINIO_BUCKET,
            minio_path,
            io.BytesIO(file_bytes),
            length=len(file_bytes),
            content_type=content_type,
        )
        logger.info("Stored %s in MinIO at %s (%d bytes)", filename, minio_path, len(file_bytes))

        doc = KnowledgeDocument(
            file_name=filename,
            file_type=file_type,
            file_size=len(file_bytes),
            minio_path=minio_path,
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        return doc

    @staticmethod
    async def list_files(
        db: AsyncSession,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[KnowledgeDocument], int]:
        total: int = (
            await db.execute(select(func.count()).select_from(KnowledgeDocument))
        ).scalar_one()

        rows = (
            await db.execute(
                select(KnowledgeDocument)
                .order_by(KnowledgeDocument.created_at.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
        ).scalars().all()

        return list(rows), total

    @staticmethod
    async def delete(db: AsyncSession, doc_id: str) -> None:
        row = (
            await db.execute(
                select(KnowledgeDocument).where(KnowledgeDocument.id == doc_id)
            )
        ).scalar_one_or_none()

        if row is None:
            raise ValueError("File not found")

        try:
            get_minio_client().remove_object(settings.MINIO_BUCKET, row.minio_path)
        except Exception as exc:
            logger.warning("MinIO remove failed for %s: %s", row.minio_path, exc)

        await db.delete(row)
        await db.commit()
        logger.info("Deleted file %s (%s)", doc_id, row.minio_path)

    @staticmethod
    def download_object(minio_path: str) -> bytes:
        """Download raw bytes from MinIO."""
        client = get_minio_client()
        response = client.get_object(settings.MINIO_BUCKET, minio_path)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    @staticmethod
    def presigned_download_url(minio_path: str, filename: str) -> str:
        from urllib.parse import quote
        client = get_minio_client()
        url = client.presigned_get_object(
            settings.MINIO_BUCKET,
            minio_path,
            expires=timedelta(hours=1),
            response_headers={
                "response-content-disposition": f'attachment; filename="{quote(filename)}"',
            },
        )
        return url
