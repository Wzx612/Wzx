"""ImageAgent — analyzes images for knowledge-base indexing.

Wraps VisionService (Qwen-VL-Max via DashScope) and builds a rich,
searchable text document from the structured analysis result.

Responsibilities:
  - OCR recognition   → analysis.texts
  - Scene analysis    → analysis.scene / analysis.style
  - Object detection  → analysis.objects
  - Tag generation    → analysis.tags
  - Text synthesis    → build_knowledge_text() for chunking + embedding

No mock vision. No fake OCR. Every call reaches the real Qwen-VL-Max API.
"""

import logging

from app.schemas.vision import AnalysisResult
from app.services.vision_service import get_vision_service

logger = logging.getLogger(__name__)


class ImageAgent:
    """Orchestrates image analysis and produces knowledge-base-ready text.

    Usage:
        analysis = await ImageAgent.analyze(presigned_url)
        text     = ImageAgent.build_knowledge_text(analysis, "photo.jpg")
    """

    @staticmethod
    async def analyze(image_url: str) -> AnalysisResult:
        """Analyze an image via a publicly accessible URL.

        Use when the image is already hosted at a reachable URL.
        Raises httpx.HTTPStatusError on API failure.
        """
        svc = get_vision_service()
        result, token_in, token_out, latency_ms = await svc.analyze_image(image_url)
        logger.info(
            "[ImageAgent] url-analyze: latency=%dms in=%d out=%d "
            "texts=%d objects=%d tags=%d",
            latency_ms, token_in, token_out,
            len(result.texts), len(result.objects), len(result.tags),
        )
        return result

    @staticmethod
    async def analyze_bytes(
        file_bytes: bytes, content_type: str
    ) -> AnalysisResult:
        """Analyze raw image bytes via base64 encoding.

        Use when the image is not publicly accessible (e.g., local MinIO).
        The bytes are base64-encoded and sent inline to Qwen-VL-Max.
        Raises httpx.HTTPStatusError on API failure.
        No mock / no fake OCR — real Qwen-VL-Max call every time.
        """
        svc = get_vision_service()
        result, token_in, token_out, latency_ms = await svc.analyze_image_bytes(
            file_bytes, content_type
        )
        logger.info(
            "[ImageAgent] bytes-analyze: latency=%dms in=%d out=%d "
            "texts=%d objects=%d tags=%d",
            latency_ms, token_in, token_out,
            len(result.texts), len(result.objects), len(result.tags),
        )
        return result

    @staticmethod
    def build_knowledge_text(analysis: AnalysisResult, filename: str) -> str:
        """Convert an AnalysisResult into a rich, searchable document.

        The output text is structured so that semantic search over Chinese
        and English queries finds relevant images efficiently.

        Sections (omitted when empty):
          文件名 / 图片描述 / OCR文字识别 / 识别对象 / 场景信息 / 关键词标签
        """
        parts: list[str] = [f"文件名：{filename}"]

        if analysis.summary:
            parts.append(f"【图片描述】\n{analysis.summary}")

        if analysis.texts:
            parts.append("【OCR文字识别】\n" + "\n".join(analysis.texts))

        if analysis.objects:
            parts.append("【识别对象】\n" + "、".join(analysis.objects))

        scene_lines: list[str] = []
        if analysis.scene:
            scene_lines.append(f"场景：{analysis.scene}")
        if analysis.style:
            scene_lines.append(f"风格：{analysis.style}")
        if scene_lines:
            parts.append("【场景信息】\n" + "\n".join(scene_lines))

        if analysis.tags:
            parts.append("【关键词标签】\n" + "、".join(analysis.tags))

        return "\n\n".join(parts)
