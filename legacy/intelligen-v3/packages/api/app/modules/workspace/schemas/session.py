"""Session schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    title: str = Field(..., min_length=1)


class UpdateSessionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)


class SessionResponse(BaseModel):
    sessionId: str
    userId: str
    title: str
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}


class WorkspaceResponse(BaseModel):
    session: SessionResponse
    tasks: list = []
    attachments: list = []
