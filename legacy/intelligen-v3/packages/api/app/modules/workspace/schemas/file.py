"""File schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class StoredFileResponse(BaseModel):
    fileId: str
    userId: str
    fileName: str
    fileUrl: str
    fileSize: int
    fileType: str
    sourceSessionId: str | None = None
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
