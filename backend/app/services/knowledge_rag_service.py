"""RAGService — BGE retrieval + DeepSeek Chat answer generation.

Flow (enforced by code structure):
  ask() / ask_stream()
    └─ RetrievalService.retrieve()   ← always runs first (RAG constraint)
    └─ _call_deepseek / _stream_deepseek  ← only called after retrieval

Module-level _call_deepseek and _stream_deepseek are kept as separate
functions so tests can patch them without importing httpx.

asyncpg note:
  Same _vec_literal / CAST(:param AS uuid) pattern used by RetrievalService —
  no :param::type syntax.
"""

import dataclasses
import json
import logging
from typing import AsyncGenerator, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.retrieval_service import RetrievalChunk, RetrievalService

logger = logging.getLogger(__name__)

_DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
_MODEL = "deepseek-chat"

_SYSTEM_PROMPT = """你是一个专业的知识库问答助手。请严格基于以下检索到的参考资料回答用户问题。

要求：
1. 只基于提供的参考资料回答，不要添加参考资料中未提及的内容
2. 如果参考资料不足以回答问题，明确告知"根据现有资料，无法完整回答此问题"
3. 引用具体来源时使用 [来源N] 格式
4. 使用简洁、专业的语言
5. 用中文回答（除非用户用英文提问）"""


# ── Result type ───────────────────────────────────────────────────────────────


@dataclasses.dataclass
class RAGResponse:
    answer: str
    sources: list[RetrievalChunk]


# ── SSE / context helpers ─────────────────────────────────────────────────────


def _sse(event_type: str, data: dict) -> str:
    """Format one SSE line (consistent with existing rag_service.py convention)."""
    return f"data: {json.dumps({'type': event_type, **data}, ensure_ascii=False)}\n\n"


def _build_context(chunks: list[RetrievalChunk]) -> str:
    parts = []
    for i, c in enumerate(chunks, 1):
        parts.append(
            f"[来源{i}]（{c.file_name}，第{c.chunk_index + 1}段）\n{c.chunk_text}"
        )
    return "\n\n---\n\n".join(parts)


def _build_messages(
    context: str,
    history: list[dict],
    question: str,
) -> list[dict]:
    """Construct the messages list for the DeepSeek API call.

    Order: system (with context) → history pairs → current question.
    """
    system_body = _SYSTEM_PROMPT
    if context:
        system_body += f"\n\n参考资料：\n\n{context}"
    else:
        system_body += "\n\n注意：知识库中没有找到与此问题相关的内容。"

    messages: list[dict] = [{"role": "system", "content": system_body}]

    for msg in history:
        if msg.get("role") in ("user", "assistant") and msg.get("content"):
            messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": question})
    return messages


# ── DeepSeek client functions (patchable in tests) ────────────────────────────


async def _call_deepseek(messages: list[dict]) -> str:
    """Non-streaming DeepSeek call. Returns the full answer string."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            _DEEPSEEK_URL,
            headers={
                "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": _MODEL,
                "messages": messages,
                "temperature": 0.3,
                "max_tokens": 2048,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def _stream_deepseek(
    messages: list[dict],
) -> AsyncGenerator[str, None]:
    """Streaming DeepSeek call. Yields content delta strings."""
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            _DEEPSEEK_URL,
            headers={
                "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": _MODEL,
                "messages": messages,
                "stream": True,
                "temperature": 0.3,
                "max_tokens": 2048,
            },
        ) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                raise RuntimeError(
                    f"DeepSeek API error {resp.status_code}: {body[:200].decode()}"
                )
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if payload.strip() == "[DONE]":
                    break
                try:
                    delta_data = json.loads(payload)
                    delta = delta_data["choices"][0]["delta"].get("content", "")
                    if delta:
                        yield delta
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


# ── RAGService ────────────────────────────────────────────────────────────────


class RAGService:
    """RAG Q&A using BGE semantic retrieval + DeepSeek Chat generation.

    Enforces the RAG constraint: both ask() and ask_stream() MUST call
    RetrievalService.retrieve() before any LLM call.  DeepSeek is never
    contacted when retrieval returns zero chunks.
    """

    _NO_CONTEXT_ANSWER = (
        "抱歉，知识库中没有找到与您问题相关的内容。请先上传并索引相关文档。"
    )

    @staticmethod
    async def ask(
        db: AsyncSession,
        question: str,
        document_id: Optional[str] = None,
        history: Optional[list[dict]] = None,
        top_k: int = 5,
        min_similarity: float = 0.0,
    ) -> RAGResponse:
        """Non-streaming RAG Q&A.

        Returns RAGResponse(answer, sources).
        If retrieval returns no chunks, DeepSeek is NOT called and a
        'no information found' message is returned.
        """
        # Step 1 — retrieval (mandatory, enforces RAG constraint)
        chunks = await RetrievalService.retrieve(
            db,
            question,
            top_k=top_k,
            min_similarity=min_similarity,
            document_id=document_id,
        )

        if not chunks:
            return RAGResponse(answer=RAGService._NO_CONTEXT_ANSWER, sources=[])

        # Step 2 — generation
        context = _build_context(chunks)
        messages = _build_messages(context, history or [], question)
        answer = await _call_deepseek(messages)
        return RAGResponse(answer=answer, sources=chunks)

    @staticmethod
    async def ask_stream(
        db: AsyncSession,
        question: str,
        document_id: Optional[str] = None,
        history: Optional[list[dict]] = None,
        top_k: int = 5,
        min_similarity: float = 0.0,
    ) -> AsyncGenerator[str, None]:
        """Streaming RAG Q&A — yields SSE strings.

        Event sequence (matches existing /api/rag/query convention):
          {"type": "sources", "sources": [...]}    ← retrieval results, always first
          {"type": "chunk",   "content": "..."}    ← answer tokens
          {"type": "done"}                         ← stream complete
          {"type": "error",   "message": "..."}    ← only on LLM failure
        """
        # Step 1 — retrieval (mandatory)
        chunks = await RetrievalService.retrieve(
            db,
            question,
            top_k=top_k,
            min_similarity=min_similarity,
            document_id=document_id,
        )

        # Always emit sources first (empty list if nothing found)
        sources_payload = [
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
        yield _sse("sources", {"sources": sources_payload})

        if not chunks:
            yield _sse("chunk", {"content": RAGService._NO_CONTEXT_ANSWER})
            yield _sse("done", {})
            return

        # Step 2 — streaming generation
        context = _build_context(chunks)
        messages = _build_messages(context, history or [], question)

        try:
            async for token in _stream_deepseek(messages):
                yield _sse("chunk", {"content": token})
        except Exception as exc:
            logger.exception("DeepSeek streaming error")
            yield _sse("error", {"message": str(exc)})

        yield _sse("done", {})
