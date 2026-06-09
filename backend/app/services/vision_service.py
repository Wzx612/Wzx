"""VisionService — wraps DashScope Qwen-VL-Max for image understanding."""

import asyncio
import base64
import json
import logging
import re
import time

import httpx

from app.core.config import settings
from app.schemas.vision import AnalysisResult

logger = logging.getLogger(__name__)

_DASHSCOPE_URL = (
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/"
    "multimodal-generation/generation"
)

# Retry policy for transient DashScope failures (rate limiting, gateway errors).
_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 1.0  # seconds; doubles each attempt (1s, 2s, 4s)
# Statuses worth retrying — throttling and transient server/gateway errors.
# 4xx client errors (400/401/415/…) are NOT retried; they won't self-heal.
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})

_PROMPT = """请详细分析这张图片，并严格按照以下JSON格式返回（不要有任何其他文字，只返回JSON）：
{
  "summary": "详细描述图片内容（100字以上）",
  "objects": ["识别到的物体1", "物体2", "..."],
  "texts": ["OCR识别到的文字1", "文字2"],
  "scene": "场景描述（室内/室外/自然/城市等）",
  "style": "风格描述（摄影/插画/截图/绘画等）",
  "tags": ["关键词1", "关键词2", "...（5-10个标签）"]
}

要求：
1. summary 必须详细描述图片主体内容、色彩、构图
2. objects 列举所有可见的物体、人物、动物
3. texts 提取图片中所有可见文字（OCR），若无文字则返回空数组
4. scene 描述拍摄或绘制场景
5. style 判断图片风格类型
6. tags 生成5-10个描述性关键词标签"""


def _extract_json(text: str) -> dict:
    """Try to extract valid JSON from model response text."""
    # Direct parse
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # Extract from markdown code block
    md_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if md_match:
        try:
            return json.loads(md_match.group(1))
        except json.JSONDecodeError:
            pass

    # Extract first {...} block
    brace_match = re.search(r"\{[\s\S]+\}", text)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except json.JSONDecodeError:
            pass

    # Fallback: treat entire text as summary
    return {
        "summary": text[:500],
        "objects": [],
        "texts": [],
        "scene": "",
        "style": "",
        "tags": [],
    }


class VisionService:
    def __init__(self) -> None:
        self._client = httpx.AsyncClient(timeout=90.0)

    async def _post_with_retry(
        self, payload: dict, headers: dict
    ) -> tuple[httpx.Response, int]:
        """POST to DashScope with exponential backoff on transient failures.

        Retries on network errors and retryable HTTP statuses (429/5xx).
        Returns (response, latency_ms) for the successful (200) attempt.
        Raises httpx.HTTPStatusError on a non-retryable status or after the
        final retry; httpx.TransportError if every attempt hits a network error.
        """
        last_exc: httpx.HTTPError | None = None

        for attempt in range(_MAX_RETRIES):
            t0 = time.perf_counter()
            try:
                response = await self._client.post(
                    _DASHSCOPE_URL, json=payload, headers=headers
                )
            except httpx.TransportError as exc:
                # Network-level failure (connect/read timeout, conn reset, …).
                last_exc = exc
                if attempt < _MAX_RETRIES - 1:
                    delay = _RETRY_BASE_DELAY * (2**attempt)
                    logger.warning(
                        "DashScope network error (attempt %d/%d): %s — retry in %.1fs",
                        attempt + 1, _MAX_RETRIES, exc, delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                raise
            latency_ms = int((time.perf_counter() - t0) * 1000)

            if response.status_code == 200:
                return response, latency_ms

            body = response.text[:500]
            err = httpx.HTTPStatusError(
                f"DashScope error {response.status_code}: {body}",
                request=response.request,
                response=response,
            )
            retryable = response.status_code in _RETRYABLE_STATUS
            if retryable and attempt < _MAX_RETRIES - 1:
                last_exc = err
                delay = _RETRY_BASE_DELAY * (2**attempt)
                logger.warning(
                    "DashScope returned %d (attempt %d/%d) — retry in %.1fs",
                    response.status_code, attempt + 1, _MAX_RETRIES, delay,
                )
                await asyncio.sleep(delay)
                continue

            # Non-retryable status, or retries exhausted — fail now.
            logger.error("DashScope returned %d: %s", response.status_code, body)
            raise err

        # Loop exhausted via network errors only (no response captured).
        assert last_exc is not None
        raise last_exc

    async def analyze_image(
        self, image_url: str
    ) -> tuple[AnalysisResult, int, int, int]:
        """Analyze an image via Qwen-VL-Max.

        Returns (result, token_input, token_output, latency_ms).
        Raises httpx.HTTPError on network/API failure.
        """
        payload = {
            "model": "qwen-vl-max",
            "input": {
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {"image": image_url},
                            {"text": _PROMPT},
                        ],
                    }
                ]
            },
            "parameters": {"result_format": "message"},
        }

        headers = {
            "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
            "Content-Type": "application/json",
        }

        response, latency_ms = await self._post_with_retry(payload, headers)
        data = response.json()

        # Extract usage
        usage = data.get("usage", {})
        token_input = usage.get("input_tokens", 0)
        token_output = usage.get("output_tokens", 0)

        # Extract model text
        choices = data.get("output", {}).get("choices", [])
        if not choices:
            raise ValueError("DashScope returned no choices")

        content = choices[0].get("message", {}).get("content", [])
        raw_text = ""
        for block in content:
            if isinstance(block, dict) and "text" in block:
                raw_text = block["text"]
                break
        if not raw_text:
            raise ValueError("DashScope returned empty content")

        logger.info(
            "DashScope response: latency=%dms input=%d output=%d",
            latency_ms,
            token_input,
            token_output,
        )

        parsed = _extract_json(raw_text)
        result = AnalysisResult(
            summary=parsed.get("summary", ""),
            objects=parsed.get("objects", []),
            texts=parsed.get("texts", []),
            scene=parsed.get("scene", ""),
            style=parsed.get("style", ""),
            tags=parsed.get("tags", []),
        )
        return result, token_input, token_output, latency_ms

    async def analyze_image_bytes(
        self, file_bytes: bytes, content_type: str
    ) -> tuple[AnalysisResult, int, int, int]:
        """Analyze raw image bytes via Qwen-VL-Max using base64 encoding.

        Use this when the image is not publicly accessible (e.g., stored on
        localhost MinIO).  The bytes are base64-encoded and sent inline.
        """
        b64 = base64.b64encode(file_bytes).decode("utf-8")
        image_data = f"data:{content_type};base64,{b64}"
        return await self.analyze_image(image_data)

    async def close(self) -> None:
        await self._client.aclose()


_vision_service: VisionService | None = None


def get_vision_service() -> VisionService:
    global _vision_service
    if _vision_service is None:
        _vision_service = VisionService()
    return _vision_service
