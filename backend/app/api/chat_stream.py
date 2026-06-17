"""POST /api/chat/stream — multi-provider streaming chat proxy.

The frontend's "AI 对话中心" (src/services/chatService.ts → streamBackend) posts
{messages, model, provider} here when VITE_API_BASE is set, so provider API keys
stay server-side instead of shipping in the browser bundle.

Output is Server-Sent Events whose `data:` payloads are the same StreamChunk union
the frontend already consumes:
    data: {"type": "thinking", "content": "..."}   ← reasoning tokens (R1/o-series)
    data: {"type": "delta",    "content": "..."}   ← answer tokens
    data: {"type": "error",    "message": "..."}   ← provider/auth failure
    data: [DONE]                                    ← end of stream

Two upstream protocols are supported:
  • OpenAI-compatible (deepseek, openai)  — /chat/completions, SSE delta chunks
  • Anthropic Messages (claude)           — /v1/messages, content_block_delta events
A provider with no configured key yields a single error event (never a 500).
"""

import json
import logging
from typing import AsyncGenerator, Literal

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

Provider = Literal["openai", "claude", "deepseek", "gemini"]


class ChatMessage(BaseModel):
    role: str
    content: str


class StreamChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)
    model: str = Field(..., min_length=1)
    provider: Provider


# ── SSE helpers (StreamChunk union the frontend already parses) ───────────────


def _sse(chunk: dict) -> str:
    return f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"


def _err(message: str) -> str:
    return _sse({"type": "error", "message": message})


_DONE = "data: [DONE]\n\n"


# ── OpenAI-compatible streaming (deepseek, openai) ────────────────────────────


async def _stream_openai_compat(
    base_url: str, api_key: str, model: str, messages: list[dict]
) -> AsyncGenerator[str, None]:
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "stream": True,
                "temperature": 0.7,
            },
        ) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode(errors="replace")
                yield _err(f"upstream {resp.status_code}: {body[:300]}")
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:].strip()
                if payload == "[DONE]":
                    break
                try:
                    delta = json.loads(payload)["choices"][0]["delta"]
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                # deepseek-reasoner / o-series expose reasoning separately
                reasoning = delta.get("reasoning_content")
                if reasoning:
                    yield _sse({"type": "thinking", "content": reasoning})
                content = delta.get("content")
                if content:
                    yield _sse({"type": "delta", "content": content})


# ── Anthropic Messages streaming (claude) ─────────────────────────────────────


async def _stream_anthropic(
    api_key: str, model: str, messages: list[dict]
) -> AsyncGenerator[str, None]:
    # Anthropic takes the system prompt as a top-level field, not a message.
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    convo = [
        {"role": "assistant" if m["role"] == "assistant" else "user", "content": m["content"]}
        for m in messages
        if m["role"] != "system"
    ]
    body: dict = {"model": model, "messages": convo, "max_tokens": 4096, "stream": True}
    if system:
        body["system"] = system

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
        ) as resp:
            if resp.status_code != 200:
                detail = (await resp.aread()).decode(errors="replace")
                yield _err(f"upstream {resp.status_code}: {detail[:300]}")
                return
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                try:
                    event = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "content_block_delta":
                    delta = event.get("delta", {})
                    if delta.get("type") == "thinking_delta" and delta.get("thinking"):
                        yield _sse({"type": "thinking", "content": delta["thinking"]})
                    elif delta.get("text"):
                        yield _sse({"type": "delta", "content": delta["text"]})


# ── Dispatch ──────────────────────────────────────────────────────────────────


def _dispatch(provider: Provider, model: str, messages: list[dict]) -> AsyncGenerator[str, None]:
    if provider == "deepseek":
        if not settings.DEEPSEEK_API_KEY:
            return _single_error("DEEPSEEK_API_KEY is not configured on the server")
        return _stream_openai_compat(
            "https://api.deepseek.com/v1", settings.DEEPSEEK_API_KEY, model, messages
        )
    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            return _single_error("OPENAI_API_KEY is not configured on the server")
        return _stream_openai_compat(
            settings.OPENAI_BASE_URL, settings.OPENAI_API_KEY, model, messages
        )
    if provider == "claude":
        if not settings.ANTHROPIC_API_KEY:
            return _single_error("ANTHROPIC_API_KEY is not configured on the server")
        return _stream_anthropic(settings.ANTHROPIC_API_KEY, model, messages)
    return _single_error(f"provider '{provider}' is not supported by the server proxy")


async def _single_error(message: str) -> AsyncGenerator[str, None]:
    yield _err(message)


# ── Route ─────────────────────────────────────────────────────────────────────


@router.post("/stream", summary="Multi-provider streaming chat (SSE)")
async def chat_stream(req: StreamChatRequest):
    messages = [m.model_dump() for m in req.messages]

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            async for sse in _dispatch(req.provider, req.model, messages):
                yield sse
        except httpx.HTTPError as exc:
            logger.warning("chat proxy upstream error: %s", exc)
            yield _err(f"upstream connection failed: {exc}")
        except Exception as exc:  # noqa: BLE001 — last-resort guard, surface to client
            logger.exception("chat proxy unexpected error")
            yield _err(f"internal error: {exc}")
        finally:
            yield _DONE

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
