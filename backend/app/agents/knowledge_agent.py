"""Knowledge Agent — LangGraph-based RAG agent for the knowledge base.

Graph nodes (executed in order):
  analyze   — prepares the question as a HumanMessage, records intent
  retrieve  — calls RetrievalService (ALWAYS; agents may not bypass retrieval)
  synthesize — builds context, calls DeepSeek if chunks were found, else fallback

State diagram:
  START → analyze → retrieve → synthesize → END

The DB session is injected via RunnableConfig.configurable["db"] so the compiled
graph can be created once at module load and reused across requests.

Note on _call_deepseek / _build_messages / _build_context:
  These are imported from knowledge_rag_service so tests can patch them at the
  `app.agents.knowledge_agent` import path using monkeypatch.
"""

import dataclasses
import logging
import operator
from typing import Annotated, Optional

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from sqlalchemy.ext.asyncio import AsyncSession
from typing_extensions import TypedDict

from app.services.knowledge_rag_service import (
    _build_context,
    _build_messages,
    _call_deepseek,
)
from app.services.retrieval_service import RetrievalChunk, RetrievalService

logger = logging.getLogger(__name__)

_NO_CONTEXT_ANSWER = (
    "抱歉，知识库中没有找到与您问题相关的内容。请先上传并索引相关文档。"
)


# ── State ─────────────────────────────────────────────────────────────────────


class KnowledgeAgentState(TypedDict):
    """Mutable state threaded through all graph nodes.

    Fields with a reducer annotation accumulate values across nodes;
    plain fields are replaced by each node's return dict.
    """

    messages: Annotated[list[BaseMessage], add_messages]
    question: str
    document_id: Optional[str]
    top_k: int
    min_similarity: float
    retrieved_chunks: list        # list[RetrievalChunk]; replaced by retrieve node
    context: str
    answer: str
    sources: list                 # list[dict]; replaced by synthesize node
    nodes_visited: Annotated[list[str], operator.add]  # for tracing / tests


# ── Nodes ─────────────────────────────────────────────────────────────────────


async def analyze_node(
    state: KnowledgeAgentState,
    config: RunnableConfig,
) -> dict:
    """Step 1 — analyze the incoming question.

    Records the question as a HumanMessage (enables multi-turn history) and
    marks the node as visited for flow tracing.
    """
    logger.info("[KnowledgeAgent] analyze: %r", state["question"][:80])
    return {
        "messages": [HumanMessage(content=state["question"])],
        "nodes_visited": ["analyze"],
    }


async def retrieve_node(
    state: KnowledgeAgentState,
    config: RunnableConfig,
) -> dict:
    """Step 2 — semantic retrieval.

    Always runs (enforces the RAG constraint — no direct LLM path exists).
    The DB session is read from config.configurable["db"].
    """
    db: AsyncSession = config["configurable"]["db"]
    chunks = await RetrievalService.retrieve(
        db,
        state["question"],
        top_k=state["top_k"],
        min_similarity=state["min_similarity"],
        document_id=state["document_id"],
    )
    logger.info("[KnowledgeAgent] retrieve: found %d chunks", len(chunks))
    return {
        "retrieved_chunks": chunks,
        "nodes_visited": ["retrieve"],
    }


async def synthesize_node(
    state: KnowledgeAgentState,
    config: RunnableConfig,
) -> dict:
    """Step 3 — synthesize an answer using DeepSeek.

    Builds the context string from retrieved chunks and passes conversation
    history (all prior messages) to DeepSeek for context memory.
    If retrieval returned no chunks, returns a fallback message without
    making any LLM call.
    """
    chunks: list[RetrievalChunk] = state["retrieved_chunks"]

    if not chunks:
        logger.info("[KnowledgeAgent] synthesize: no chunks — returning fallback")
        return {
            "answer": _NO_CONTEXT_ANSWER,
            "context": "",
            "sources": [],
            "messages": [AIMessage(content=_NO_CONTEXT_ANSWER)],
            "nodes_visited": ["synthesize"],
        }

    context = _build_context(chunks)

    # Build history from all previous messages (excluding the current HumanMessage
    # just added in analyze_node — _build_messages appends the question itself).
    prior_messages = [
        m for m in state["messages"]
        if not (isinstance(m, HumanMessage) and m.content == state["question"])
    ]
    history_dicts = [
        {
            "role": "user" if isinstance(m, HumanMessage) else "assistant",
            "content": m.content,
        }
        for m in prior_messages
    ]

    messages_for_llm = _build_messages(context, history_dicts, state["question"])
    answer = await _call_deepseek(messages_for_llm)

    sources = [
        {
            "chunk_id": c.chunk_id,
            "document_id": c.document_id,
            "file_name": c.file_name,
            "chunk_index": c.chunk_index,
            "chunk_text": c.chunk_text[:300] + ("…" if len(c.chunk_text) > 300 else ""),
            "similarity": round(c.similarity, 4),
        }
        for c in chunks
    ]

    logger.info("[KnowledgeAgent] synthesize: answer generated, %d sources", len(sources))
    return {
        "answer": answer,
        "context": context,
        "sources": sources,
        "messages": [AIMessage(content=answer)],
        "nodes_visited": ["synthesize"],
    }


# ── Graph factory ──────────────────────────────────────────────────────────────


def _build_graph():
    builder = StateGraph(KnowledgeAgentState)

    builder.add_node("analyze", analyze_node)
    builder.add_node("retrieve", retrieve_node)
    builder.add_node("synthesize", synthesize_node)

    builder.add_edge(START, "analyze")
    builder.add_edge("analyze", "retrieve")
    builder.add_edge("retrieve", "synthesize")
    builder.add_edge("synthesize", END)

    return builder.compile()


# Compiled once at import time (no checkpointer — pure in-memory execution).
_GRAPH = _build_graph()


# ── Public API ────────────────────────────────────────────────────────────────


@dataclasses.dataclass
class AgentResult:
    answer: str
    sources: list[dict]
    nodes_visited: list[str]
    messages: list[BaseMessage]


class KnowledgeAgent:
    """Thin wrapper around the compiled LangGraph knowledge agent.

    Usage:
        result = await KnowledgeAgent.run(db, "北京住宅市场成交量？")
    """

    @staticmethod
    def _initial_state(
        question: str,
        document_id: Optional[str],
        history: list[dict],
        top_k: int,
        min_similarity: float,
    ) -> KnowledgeAgentState:
        """Build the initial state from caller-supplied parameters."""
        prior_messages: list[BaseMessage] = []
        for msg in history:
            if msg.get("role") == "user":
                prior_messages.append(HumanMessage(content=msg["content"]))
            elif msg.get("role") == "assistant":
                prior_messages.append(AIMessage(content=msg["content"]))

        return KnowledgeAgentState(
            messages=prior_messages,
            question=question,
            document_id=document_id,
            top_k=top_k,
            min_similarity=min_similarity,
            retrieved_chunks=[],
            context="",
            answer="",
            sources=[],
            nodes_visited=[],
        )

    @staticmethod
    async def run(
        db: AsyncSession,
        question: str,
        document_id: Optional[str] = None,
        history: Optional[list[dict]] = None,
        top_k: int = 5,
        min_similarity: float = 0.0,
    ) -> AgentResult:
        """Execute the full knowledge agent pipeline and return the result."""
        state = KnowledgeAgent._initial_state(
            question, document_id, history or [], top_k, min_similarity
        )
        final = await _GRAPH.ainvoke(
            state,
            config=RunnableConfig(configurable={"db": db}),
        )
        return AgentResult(
            answer=final["answer"],
            sources=final["sources"],
            nodes_visited=final["nodes_visited"],
            messages=final["messages"],
        )
