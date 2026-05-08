"""管理后台请求/响应模型"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.modules.auth.enums import UserRole


class UserAuditRequest(BaseModel):
    authStatus: int = Field(..., ge=1, le=2)  # 1=APPROVED, 2=DISABLED


class PendingUserResponse(BaseModel):
    userId: str
    username: str
    nickname: str
    email: str
    role: UserRole
    authStatus: int
    createdAt: datetime

    model_config = {"from_attributes": True}


class AuditLogResponse(BaseModel):
    id: int
    requestId: str
    traceId: str
    operatorUsername: str
    operatorRole: str
    actionCode: str
    actionName: str
    requestMethod: str
    requestPath: str
    responseStatus: int
    success: bool
    summary: str
    detail: str | None = None
    clientIp: str | None = None
    createdAt: datetime

    model_config = {"from_attributes": True}


class UserDetailResponse(BaseModel):
    userId: str
    username: str
    nickname: str
    email: str
    role: str
    authStatus: int
    createdAt: datetime
    taskCount: int = 0
    sessionCount: int = 0

    model_config = {"from_attributes": True}


class ModelConfigRequest(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model_id: Optional[str] = None
    model_type: Optional[str] = None
    is_active: Optional[bool] = None
    rpm_limit: Optional[int] = None
    tpm_limit: Optional[int] = None
    config_json: Optional[dict[str, Any]] = None
