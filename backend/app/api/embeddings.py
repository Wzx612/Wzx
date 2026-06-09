from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.knowledge_chunk import KnowledgeChunk
from app.models.knowledge_document import KnowledgeDocument
from app.services.embedding_service import EmbeddingService

router = APIRouter()


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=512)


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]
    dim: int
    model: str


@router.post("/embed", response_model=EmbedResponse)
async def embed_texts(req: EmbedRequest) -> EmbedResponse:
    """Embed raw texts and return the vectors.

    This is the internal contract the embedding-service exposes to the
    rag-service and agent-service (remote embedding mode). It is served by the
    model-hosting container — never configure EMBEDDING_SERVICE_URL here, or it
    would proxy to itself.
    """
    vectors = await EmbeddingService.generate_embeddings(req.texts)
    return EmbedResponse(
        embeddings=vectors,
        dim=EmbeddingService.EMBEDDING_DIM,
        model=EmbeddingService.MODEL_NAME,
    )


@router.post("/generate/{document_id}", status_code=200)
async def generate_embeddings(
    document_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Generate and persist BGE embeddings for all chunks of a document.

    Returns {"chunkCount": N} after all embeddings are saved.
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

    saved = await EmbeddingService.generate_for_document(db, document_id)
    return {"chunkCount": saved}
