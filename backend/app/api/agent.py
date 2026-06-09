"""POST /api/agent/chat — Coordinator-routed knowledge agent Q&A."""

from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.agents.coordinator import CoordinatorAgent

router = APIRouter()


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AgentChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=4000)
    document_id: Optional[str] = None
    history: list[HistoryMessage] = Field(default_factory=list)
    top_k: int = Field(default=5, ge=1, le=20)
    min_similarity: float = Field(default=0.0, ge=0.0, le=1.0)


class SourceItem(BaseModel):
    chunk_id: str
    document_id: str
    file_name: str
    chunk_index: int
    chunk_text: str
    similarity: float


class AgentChatResponse(BaseModel):
    answer: str
    sources: list[SourceItem]
    agent_used: str
    nodes_visited: list[str]


@router.post(
    "/chat",
    response_model=AgentChatResponse,
    summary="Coordinator-routed knowledge agent Q&A",
)
async def agent_chat(
    req: AgentChatRequest,
    db: AsyncSession = Depends(get_db),
) -> AgentChatResponse:
    """Q&A routed through the Coordinator Agent → Knowledge Agent pipeline.

    The Coordinator selects the appropriate specialized agent for the question.
    Knowledge Agent always performs semantic retrieval before calling the LLM.

    Returns the answer, citation sources, which agent was used, and the list
    of LangGraph nodes that executed (useful for debugging / tracing).
    """
    try:
        result = await CoordinatorAgent.run(
            db=db,
            question=req.question,
            document_id=req.document_id,
            history=[h.model_dump() for h in req.history],
            top_k=req.top_k,
            min_similarity=req.min_similarity,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail=f"LLM service unavailable: {exc}") from exc

    return AgentChatResponse(
        answer=result.answer,
        sources=[
            SourceItem(
                chunk_id=s["chunk_id"],
                document_id=s["document_id"],
                file_name=s["file_name"],
                chunk_index=s["chunk_index"],
                chunk_text=s["chunk_text"],
                similarity=s["similarity"],
            )
            for s in result.sources
        ],
        agent_used=result.agent_used,
        nodes_visited=result.nodes_visited,
    )
