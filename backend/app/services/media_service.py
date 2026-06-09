"""Text-to-image generation via DashScope Tongyi Wanxiang (通义万相).

The DashScope image-synthesis API is asynchronous: submit a prompt to get a
task_id, then poll the task until it SUCCEEDED/FAILED. We expose the task_id
directly as the job id so the API layer stays stateless (no job store needed).

Docs: https://help.aliyun.com/zh/model-studio/text-to-image
"""

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_SUBMIT_URL = (
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis"
)
_TASK_URL = "https://dashscope.aliyuncs.com/api/v1/tasks/{task_id}"
_MODEL = "wanx2.1-t2i-turbo"  # fast, low-cost text-to-image
_VALID_SIZES = {"1024*1024", "720*1280", "1280*720", "768*1152", "1152*768"}
_DEFAULT_SIZE = "1024*1024"


async def submit(prompt: str, size: str = _DEFAULT_SIZE) -> str:
    """Submit a text-to-image task. Returns the DashScope task_id."""
    if size not in _VALID_SIZES:
        size = _DEFAULT_SIZE
    headers = {
        "Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}",
        "X-DashScope-Async": "enable",
        "Content-Type": "application/json",
    }
    body = {
        "model": _MODEL,
        "input": {"prompt": prompt},
        "parameters": {"size": size, "n": 1},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(_SUBMIT_URL, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()
    task_id = data.get("output", {}).get("task_id")
    if not task_id:
        raise RuntimeError(f"DashScope returned no task_id: {data}")
    logger.info("t2i: submitted task=%s size=%s", task_id, size)
    return task_id


async def poll(task_id: str) -> dict:
    """Poll a task. Returns {status, progress, url?, error?} mapping to MediaJob.

    DashScope task_status: PENDING | RUNNING | SUCCEEDED | FAILED | UNKNOWN.
    """
    headers = {"Authorization": f"Bearer {settings.DASHSCOPE_API_KEY}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(_TASK_URL.format(task_id=task_id), headers=headers)
        resp.raise_for_status()
        data = resp.json()

    out = data.get("output", {})
    st = out.get("task_status", "UNKNOWN")

    if st == "SUCCEEDED":
        results = out.get("results", []) or []
        url = results[0].get("url") if results else None
        if not url:
            return {"status": "error", "progress": 0, "error": "no image url in result"}
        return {"status": "done", "progress": 100, "url": url}
    if st == "FAILED":
        return {"status": "error", "progress": 0, "error": out.get("message", "generation failed")}
    if st == "RUNNING":
        return {"status": "generating", "progress": 60}
    # PENDING / UNKNOWN
    return {"status": "generating", "progress": 15}
