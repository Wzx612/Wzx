"""DashScope text-embedding-v2 embeddings (dim=1536)."""

import logging
import asyncio
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_EMBEDDING_URL = (
    "https://dashscope.aliyuncs.com/api/v1/services/embeddings/"
    "text-embedding/text-embedding"
)
_MODEL = "text-embedding-v2"
_BATCH_SIZE = 25  # DashScope max batch
_DIM = 1536


async def embed_texts(
    texts: list[str],
    text_type: str = "document",  # "document" or "query"
) -> list[list[float]]:
    """Embed a list of texts in batches. Returns list of 1536-dim vectors."""
    if not texts:
        return []

    client = httpx.AsyncClient(timeout=60.0)
    all_embeddings: list[list[float]] = []

    try:
        for batch_start in range(0, len(texts), _BATCH_SIZE):
            batch = texts[batch_start : batch_start + _BATCH_SIZE]
            embeddings = await _embed_batch(client, batch, text_type)
            all_embeddings.extend(embeddings)
    finally:
        await client.aclose()

    return all_embeddings


async def embed_query(query: str) -> list[float]:
    """Embed a single query string."""
    results = await embed_texts([query], text_type="query")
    return results[0]


async def _embed_batch(
    client: httpx.AsyncClient,
    texts: list[str],
    text_type: str,
) -> list[list[float]]:
    payload = {
        "model": _MODEL,
        "input": {"texts": texts},
        "parameters": {"text_type": text_type},
    }
    headers = {
        "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
        "Content-Type": "application/json",
    }

    resp = await client.post(_EMBEDDING_URL, json=payload, headers=headers)
    if resp.status_code != 200:
        raise RuntimeError(f"DashScope embedding error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    embeddings_raw: list[dict] = data["output"]["embeddings"]
    # Sort by text_index to preserve order
    embeddings_raw.sort(key=lambda x: x["text_index"])
    return [e["embedding"] for e in embeddings_raw]
