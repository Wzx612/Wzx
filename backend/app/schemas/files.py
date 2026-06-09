from datetime import datetime

from pydantic import BaseModel, field_validator


class FileOut(BaseModel):
    id: str
    file_name: str
    file_type: str
    file_size: int
    minio_path: str
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: object) -> str:
        return str(v)


class FileListResponse(BaseModel):
    items: list[FileOut]
    total: int
