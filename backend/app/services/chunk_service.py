"""Chunk splitting service using LangChain RecursiveCharacterTextSplitter."""

import logging
import uuid

from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy import delete, insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge_chunk import KnowledgeChunk

logger = logging.getLogger(__name__)

_SEPARATORS = ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""]


class ChunkService:
    """Stateless chunking service.

    split_document() is a pure function — no I/O.
    generate_chunks() coordinates DB persistence.
    """

    CHUNK_SIZE = 1000
    CHUNK_OVERLAP = 200

    _splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=_SEPARATORS,
        length_function=len,
        is_separator_regex=False,
    )

    @classmethod
    def split_document(cls, content: str) -> list[str]:
        """Split text into chunks of ≤ CHUNK_SIZE characters with CHUNK_OVERLAP overlap.

        Handles Chinese, English, and mixed text via a separator hierarchy that
        covers both CJK sentence terminators and ASCII punctuation.

        Returns an empty list for blank / whitespace-only input.
        """
        if not content or not content.strip():
            return []
        return cls._splitter.split_text(content)

    @classmethod
    async def generate_chunks(
        cls, db: AsyncSession, document_id: str, content: str
    ) -> int:
        """Replace all chunks for *document_id* with freshly split ones.

        Deletes any existing rows, then bulk-inserts the new chunks.
        Returns the total chunk count written.
        """
        chunks = cls.split_document(content)

        await db.execute(
            delete(KnowledgeChunk).where(
                KnowledgeChunk.document_id == document_id
            )
        )

        if chunks:
            rows = [
                {
                    "id": uuid.uuid4(),
                    "document_id": document_id,
                    "chunk_index": idx,
                    "chunk_text": text,
                }
                for idx, text in enumerate(chunks)
            ]
            await db.execute(insert(KnowledgeChunk), rows)

        await db.commit()
        logger.info(
            "Generated %d chunks for document %s", len(chunks), document_id
        )
        return len(chunks)
