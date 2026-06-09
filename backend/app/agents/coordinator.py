"""Coordinator Agent — routes questions to specialized agents.

Currently routes all knowledge-base questions to KnowledgeAgent.  The routing
table is designed to be extended: add more agents and update _route() to decide
which one to call based on question content, document type, or user context.

知识库路由 (knowledge base routing):
  - When document_id is given: the question is scoped to that document.
  - When document_id is None: the KnowledgeAgent searches across all indexed
    documents (global search).
  - Future: classify question → pick a domain-specific document_id automatically.
"""

import dataclasses
import logging
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.knowledge_agent import AgentResult, KnowledgeAgent

logger = logging.getLogger(__name__)

_AGENT_KNOWLEDGE = "knowledge"


# ── Response type ─────────────────────────────────────────────────────────────


@dataclasses.dataclass
class CoordinatorResponse:
    answer: str
    sources: list[dict]
    agent_used: str
    nodes_visited: list[str]


# ── Routing logic ─────────────────────────────────────────────────────────────


def _route(_question: str) -> str:
    """Decide which agent should handle this question.

    Currently always returns "knowledge" because the knowledge base is the only
    available agent.  Future extensions: "vision", "calculator", "general", etc.
    """
    return _AGENT_KNOWLEDGE


# ── CoordinatorAgent ──────────────────────────────────────────────────────────


class CoordinatorAgent:
    """Entry point for all agent-based Q&A.

    Responsibilities:
      1. Route the question to the correct specialized agent.
      2. Call that agent with the appropriate parameters.
      3. Return a unified CoordinatorResponse.

    Knowledge base routing:
      Pass document_id to limit retrieval to a specific document.
      Omit document_id (or pass None) to search the entire knowledge base.
    """

    @staticmethod
    async def run(
        db: AsyncSession,
        question: str,
        document_id: Optional[str] = None,
        history: Optional[list[dict]] = None,
        top_k: int = 5,
        min_similarity: float = 0.0,
    ) -> CoordinatorResponse:
        """Route and execute the question, returning a unified response."""
        agent_name = _route(question)
        logger.info("[Coordinator] routing to agent=%r for question=%r", agent_name, question[:60])

        if agent_name == _AGENT_KNOWLEDGE:
            result: AgentResult = await KnowledgeAgent.run(
                db=db,
                question=question,
                document_id=document_id,
                history=history,
                top_k=top_k,
                min_similarity=min_similarity,
            )
        else:
            raise NotImplementedError(f"Unknown agent: {agent_name!r}")

        return CoordinatorResponse(
            answer=result.answer,
            sources=result.sources,
            agent_used=agent_name,
            nodes_visited=result.nodes_visited,
        )
