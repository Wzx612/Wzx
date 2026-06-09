"""MultimodalIndexService — full image-to-knowledge-base pipeline.

Flow:
  upload_knowledge_image   → MinIO (knowledge-images/ prefix)
  ImageAgent.analyze       → Qwen-VL-Max (real API, no mock)
  ImageAgent.build_knowledge_text → rich searchable text
  knowledge_documents      → INSERT row (file_type = MIME type)
  ChunkService.generate_chunks   → split text into chunks
  EmbeddingService.generate_for_document → BGE embeddings
  knowledge_embeddings     → stored, queryable via RetrievalService

After indexing, the image's textual content (description, OCR, tags)
is searchable exactly like any other knowledge document.
"""

import dataclasses
import logging
import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.minio_client import upload_knowledge_image
from app.models.knowledge_document import KnowledgeDocument  # noqa: F401 — registers with Base.metadata so ChunkService FK resolves
from app.schemas.vision import AnalysisResult
from app.services.chunk_service import ChunkService
from app.services.embedding_service import EmbeddingService
from app.services.image_agent import ImageAgent

logger = logging.getLogger(__name__)

_SUPPORTED_TYPES = {"image/jpeg", "image/png", "image/webp"}


# ── Result type ───────────────────────────────────────────────────────────────


@dataclasses.dataclass
class ImageIndexResult:
    document_id: str
    image_url: str          # presigned URL (7-day validity)
    minio_path: str         # MinIO object key (permanent reference)
    file_name: str
    file_type: str
    file_size: int
    analysis: AnalysisResult
    chunk_count: int
    embedding_count: int


# ── Service ───────────────────────────────────────────────────────────────────


class MultimodalIndexService:
    """Orchestrates image upload, vision analysis, and knowledge-base indexing."""

    @staticmethod
    async def index_image(
        db: AsyncSession,
        file_bytes: bytes,
        content_type: str,
        filename: str,
    ) -> ImageIndexResult:
        """Run the full multimodal indexing pipeline.

        Steps:
          1. Validate MIME type.
          2. Upload to MinIO (knowledge-images/ prefix).
          3. Analyze via Qwen-VL-Max — REAL API call, no mock.
          4. Build rich knowledge text from the analysis.
          5. Insert into knowledge_documents.
          6. Chunk with ChunkService.
          7. Embed with EmbeddingService (BGE).

        Returns ImageIndexResult with all metadata and counts.
        Raises ValueError for unsupported content types.
        Raises httpx.HTTPStatusError if Qwen-VL API fails.
        """
        if content_type not in _SUPPORTED_TYPES:
            raise ValueError(
                f"Unsupported image type '{content_type}'. "
                f"Allowed: {', '.join(sorted(_SUPPORTED_TYPES))}"
            )

        # ── Step 1: upload to MinIO (storage only) ─────────────────────────
        minio_path, presigned_url = upload_knowledge_image(file_bytes, content_type)
        logger.info("[Multimodal] uploaded %s → %s", filename, minio_path)

        # ── Step 2: Qwen-VL analysis via base64 (not the MinIO URL) ────────
        # MinIO is typically on localhost and not reachable from DashScope.
        # Encoding the bytes as base64 works regardless of network topology.
        analysis = await ImageAgent.analyze_bytes(file_bytes, content_type)
        logger.info("[Multimodal] analysis complete for %s", filename)

        # ── Step 3: build knowledge text ────────────────────────────────────
        knowledge_text = ImageAgent.build_knowledge_text(analysis, filename)

        # ── Step 4: persist knowledge_document ─────────────────────────────
        doc_id = str(uuid.uuid4())
        await db.execute(
            text("""
                INSERT INTO knowledge_documents
                    (id, file_name, file_type, file_size, minio_path)
                VALUES
                    (CAST(:id AS uuid), :file_name, :file_type, :file_size, :minio_path)
            """),
            {
                "id": doc_id,
                "file_name": filename,
                "file_type": content_type,
                "file_size": len(file_bytes),
                "minio_path": minio_path,
            },
        )
        await db.commit()
        logger.info("[Multimodal] created knowledge document %s", doc_id)

        # ── Step 5: chunk ──────────────────────────────────────────────────
        chunk_count = await ChunkService.generate_chunks(db, doc_id, knowledge_text)
        logger.info("[Multimodal] %d chunks for %s", chunk_count, doc_id)

        # ── Step 6: embed ──────────────────────────────────────────────────
        embedding_count = await EmbeddingService.generate_for_document(db, doc_id)
        logger.info("[Multimodal] %d embeddings for %s", embedding_count, doc_id)

        return ImageIndexResult(
            document_id=doc_id,
            image_url=presigned_url,
            minio_path=minio_path,
            file_name=filename,
            file_type=content_type,
            file_size=len(file_bytes),
            analysis=analysis,
            chunk_count=chunk_count,
            embedding_count=embedding_count,
        )
