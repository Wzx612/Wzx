from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class AnalysisResult(BaseModel):
    summary: str = Field(description="图片内容总述")
    objects: list[str] = Field(default_factory=list, description="识别到的物体列表")
    texts: list[str] = Field(default_factory=list, description="OCR 识别的文字列表")
    scene: str = Field(default="", description="场景描述")
    style: str = Field(default="", description="风格描述")
    tags: list[str] = Field(default_factory=list, description="关键词标签")


class VisionResponse(BaseModel):
    id: str
    image_url: str
    original_filename: str
    result: AnalysisResult
    latency_ms: int
    token_input: int
    token_output: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalysisRecord(BaseModel):
    id: str
    image_url: str
    original_filename: str
    summary: str
    tags: list[str]
    created_at: datetime
    status: str
    latency_ms: int | None

    model_config = {"from_attributes": True}


class PaginatedHistory(BaseModel):
    items: list[AnalysisRecord]
    total: int
    page: int
    page_size: int
    pages: int


class ErrorResponse(BaseModel):
    detail: str
    code: str | None = None
    extra: Any | None = None
