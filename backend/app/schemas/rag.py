from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


class DocumentOut(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: int
    status: str
    chunk_count: int
    error_message: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: object) -> str:
        return str(v)


class DocumentListResponse(BaseModel):
    items: list[DocumentOut]
    total: int


class ChunkOut(BaseModel):
    id: str
    content: str
    chunk_index: int
    metadata: dict[str, Any]
    similarity: float | None = None


class RAGQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)
    document_ids: list[str] | None = None


class SourceReference(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    chunk_index: int
    content: str
    similarity: float
