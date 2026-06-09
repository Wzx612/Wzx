"""POST /api/rag/chat — BGE semantic retrieval + DeepSeek Chat answer generation."""

from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.knowledge_rag_service import RAGService

router = APIRouter()


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    document_id: Optional[str] = None
    history: list[HistoryMessage] = Field(default_factory=list)
    top_k: int = Field(default=5, ge=1, le=20)
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)
    stream: bool = False


class SourceItem(BaseModel):
    chunk_id: str
    document_id: str
    file_name: str
    chunk_index: int
    chunk_text: str
    similarity: float


class ChatResponse(BaseModel):
    answer: str
    sources: list[SourceItem]


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="RAG Q&A — BGE retrieval + DeepSeek generation",
)
async def chat(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Q&A over the knowledge base.

    Retrieval always runs before generation (RAG constraint is enforced by the service).
    Pass stream=true to receive Server-Sent Events instead of a JSON body.

    SSE event sequence when stream=true:
      {"type": "sources", "sources": [...]}   ← retrieval results
      {"type": "chunk",   "content": "..."}   ← answer tokens
      {"type": "done"}                         ← end of stream
      {"type": "error",   "message": "..."}   ← only on LLM failure
    """
    history_dicts = [h.model_dump() for h in req.history]

    if req.stream:
        async def event_stream():
            async for sse_str in RAGService.ask_stream(
                db=db,
                question=req.question,
                document_id=req.document_id,
                history=history_dicts,
                top_k=req.top_k,
                min_similarity=req.min_similarity,
            ):
                yield sse_str

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    try:
        result = await RAGService.ask(
            db=db,
            question=req.question,
            document_id=req.document_id,
            history=history_dicts,
            top_k=req.top_k,
            min_similarity=req.min_similarity,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"LLM service unavailable: {exc}") from exc

    return ChatResponse(
        answer=result.answer,
        sources=[
            SourceItem(
                chunk_id=s.chunk_id,
                document_id=s.document_id,
                file_name=s.file_name,
                chunk_index=s.chunk_index,
                chunk_text=s.chunk_text,
                similarity=s.similarity,
            )
            for s in result.sources
        ],
    )
