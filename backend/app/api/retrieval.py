from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.retrieval_service import RetrievalService

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Natural language query")
    top_k: int = Field(default=5, ge=1, le=50)
    min_similarity: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Minimum cosine similarity threshold",
    )
    document_id: Optional[str] = Field(
        default=None, description="Restrict search to a specific document"
    )
    mode: Literal["semantic", "hybrid"] = Field(
        default="semantic",
        description="Search mode — 'hybrid' is reserved and falls back to semantic",
    )


class ChunkResult(BaseModel):
    chunk_id: str
    document_id: str
    file_name: str
    chunk_index: int
    chunk_text: str
    similarity: float


class SearchResponse(BaseModel):
    query: str
    results: list[ChunkResult]
    total: int
    mode: str


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.post("/search", status_code=200)
async def search(
    req: SearchRequest,
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Semantic retrieval: embed query → pgvector search → return ranked chunks.

    Returns the most relevant chunks from the knowledge base along with
    citation metadata (file_name, chunk_index) for each result.
    """
    if not req.query.strip():
        raise HTTPException(status_code=422, detail="Query cannot be empty")

    chunks = await RetrievalService.retrieve(
        db=db,
        query=req.query,
        top_k=req.top_k,
        min_similarity=req.min_similarity,
        document_id=req.document_id,
        mode=req.mode,
    )

    return SearchResponse(
        query=req.query,
        results=[
            ChunkResult(
                chunk_id=c.chunk_id,
                document_id=c.document_id,
                file_name=c.file_name,
                chunk_index=c.chunk_index,
                chunk_text=c.chunk_text,
                similarity=c.similarity,
            )
            for c in chunks
        ],
        total=len(chunks),
        mode=req.mode,
    )
