"""Text-to-image API — submit a prompt, poll the job for the result image.

Mounted at /api/media (auth-gated). The frontend mediaService consumes:
  POST /api/media/generate { kind, prompt, size? } -> { id }
  GET  /api/media/{id}                              -> { id, kind, status, progress, url? }
Backed by DashScope Tongyi Wanxiang (see app/services/media_service.py).
"""

import logging

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.services import media_service

logger = logging.getLogger(__name__)
router = APIRouter()


class GenerateRequest(BaseModel):
    kind: str = "image"
    prompt: str = Field(..., min_length=1, max_length=800)
    size: str | None = None


@router.post("/generate")
async def generate(req: GenerateRequest) -> dict:
    if req.kind != "image":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="仅支持文生图（kind=image）",
        )
    try:
        task_id = await media_service.submit(req.prompt, req.size or "1024*1024")
    except httpx.HTTPStatusError as exc:
        body = exc.response.text[:300]
        logger.warning("t2i submit failed: %s %s", exc.response.status_code, body)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"DashScope 错误: {body}")
    except Exception as exc:  # noqa: BLE001
        logger.warning("t2i submit error: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return {"id": task_id}


@router.get("/{task_id}")
async def job_status(task_id: str) -> dict:
    try:
        result = await media_service.poll(task_id)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.response.text[:300])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    return {"id": task_id, "kind": "image", **result}
