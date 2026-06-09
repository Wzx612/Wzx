"""RAG pipeline with multi-agent SSE streaming."""

import json
import logging
from typing import AsyncIterator

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.embedder import embed_query
from app.services.vector_store import similarity_search

logger = logging.getLogger(__name__)

_DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
_DEV_PROXY = "/deepseek-proxy/v1/chat/completions"  # Vite handles this client-side

_SYSTEM_PROMPT = """你是一个专业的知识库问答助手。请基于以下检索到的文档内容回答用户问题。

要求：
1. 只基于提供的文档内容回答，不要编造信息
2. 如果文档中没有相关信息，明确告知用户
3. 回答要简洁、准确、有条理
4. 用中文回答（除非用户用英文提问）
5. 引用来源时使用 [来源X] 格式"""


def _sse(event_type: str, data: dict) -> str:
    return f"data: {json.dumps({'type': event_type, **data}, ensure_ascii=False)}\n\n"


def _build_context(chunks: list[dict]) -> str:
    parts: list[str] = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk.get("metadata", {})
        source_hint = f"（{chunk['filename']}，第{chunk['chunk_index']+1}段）"
        parts.append(f"[来源{i}] {source_hint}\n{chunk['content']}")
    return "\n\n---\n\n".join(parts)


async def rag_stream(
    query: str,
    db: AsyncSession,
    top_k: int = 5,
    document_ids: list[str] | None = None,
    deepseek_api_key: str = "",
) -> AsyncIterator[str]:
    """Yield SSE strings for the full RAG pipeline."""

    # ── Agent 1: QueryAnalyzer ───────────────────────────────
    yield _sse("agent", {"name": "QueryAnalyzer", "action": "分析查询意图…", "done": False})

    # Simple intent classification (can be extended with LLM call)
    intent = "knowledge_retrieval"
    yield _sse("agent", {"name": "QueryAnalyzer", "action": f"意图识别: {intent}", "done": True})

    # ── Agent 2: Retriever ───────────────────────────────────
    yield _sse("agent", {"name": "Retriever", "action": "向量化查询并搜索知识库…", "done": False})

    try:
        query_embedding = await embed_query(query)
    except Exception as exc:
        yield _sse("error", {"message": f"向量化查询失败: {exc}"})
        return

    chunks = await similarity_search(db, query_embedding, top_k=top_k, document_ids=document_ids)

    if not chunks:
        yield _sse("agent", {"name": "Retriever", "action": "未找到相关文档内容", "done": True})
        yield _sse("chunk", {"content": "抱歉，知识库中没有找到与您问题相关的内容。请先上传相关文档。"})
        yield _sse("sources", {"sources": []})
        yield _sse("done", {})
        return

    yield _sse(
        "agent",
        {"name": "Retriever", "action": f"检索到 {len(chunks)} 个相关段落", "done": True},
    )

    # ── Agent 3: Synthesizer (DeepSeek streaming) ────────────
    yield _sse("agent", {"name": "Synthesizer", "action": "基于检索结果生成回答…", "done": False})

    context = _build_context(chunks)
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"参考文档内容：\n\n{context}\n\n用户问题：{query}",
        },
    ]

    answer_accumulated = ""
    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            async with client.stream(
                "POST",
                _DEEPSEEK_URL,
                headers={
                    "Authorization": f"Bearer {deepseek_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "deepseek-chat",
                    "messages": messages,
                    "stream": True,
                    "temperature": 0.3,
                    "max_tokens": 2048,
                },
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    yield _sse("error", {"message": f"DeepSeek API error {resp.status_code}: {body[:200].decode()}"})
                    return

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
                            answer_accumulated += delta
                            yield _sse("chunk", {"content": delta})
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

    except Exception as exc:
        logger.exception("DeepSeek streaming error")
        yield _sse("error", {"message": f"生成回答时出错: {exc}"})
        return

    yield _sse("agent", {"name": "Synthesizer", "action": "回答生成完毕", "done": True})

    # ── Agent 4: CitationAgent ───────────────────────────────
    yield _sse("agent", {"name": "CitationAgent", "action": "整理引用来源…", "done": False})

    sources = [
        {
            "chunk_id": c["chunk_id"],
            "document_id": c["document_id"],
            "filename": c["filename"],
            "chunk_index": c["chunk_index"],
            "content": c["content"][:300] + ("…" if len(c["content"]) > 300 else ""),
            "similarity": round(c["similarity"], 4),
        }
        for c in chunks
    ]
    yield _sse("agent", {"name": "CitationAgent", "action": f"已标注 {len(sources)} 个来源", "done": True})
    yield _sse("sources", {"sources": sources})
    yield _sse("done", {})
