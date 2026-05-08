"""LLM Provider / Stage 配置 — Pydantic 请求 / 响应模型"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


# ── 提供商 ─────────────────────────────────────────────

class ProviderCreateRequest(BaseModel):
    name: str = Field(..., max_length=200, description="显示名, 如 OpenRouter / DeepSeek")
    api_format: str = Field(
        ...,
        pattern=r"^(openai_compatible|anthropic|google)$",
        description="API 格式",
    )
    base_url: str = Field(..., max_length=500)
    api_key: Optional[str] = Field(None, description="明文 API Key，保存时加密")
    models_json: Optional[List[str]] = Field(None, description="可用模型 ID 列表")
    deployment_type: str = Field("cloud", pattern=r"^(cloud|local)$")
    auth_required: bool = True
    is_active: bool = True
    priority: int = Field(0, ge=0)


class ProviderUpdateRequest(BaseModel):
    name: Optional[str] = None
    api_format: Optional[str] = Field(
        None, pattern=r"^(openai_compatible|anthropic|google)$"
    )
    base_url: Optional[str] = None
    api_key: Optional[str] = Field(None, description="传空字符串清除密钥; 不传则不修改")
    models_json: Optional[List[str]] = None
    deployment_type: Optional[str] = Field(None, pattern=r"^(cloud|local)$")
    auth_required: Optional[bool] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=0)


class ProviderResponse(BaseModel):
    id: str
    name: str
    api_format: str
    base_url: str
    has_api_key: bool
    models_json: Optional[List[str]] = None
    deployment_type: str
    auth_required: bool
    is_active: bool
    priority: int
    health_status: str
    health_checked_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


# ── Stage 配置 ─────────────────────────────────────────

class StageConfigItem(BaseModel):
    stage: str
    provider_id: str
    model: str
    is_fallback: bool = False
    priority: int = 0


class StageConfigUpdateRequest(BaseModel):
    configs: List[StageConfigItem]


class StageConfigResponse(BaseModel):
    id: str
    stage: str
    provider_id: str
    model: str
    is_fallback: bool
    priority: int
    created_at: Optional[str] = None


# ── AI 辅助自动配置 ─────────────────────────────────────

class ProbeModelsRequest(BaseModel):
    base_url: str = Field(..., max_length=500)
    api_key: str = Field(..., min_length=1)
    api_format: str = Field(
        "openai_compatible",
        pattern=r"^(openai_compatible|anthropic|google)$",
    )


class AutoConfigureRequest(BaseModel):
    decision_model: str = Field(..., min_length=1, description="用于生成分配方案的模型")


class StageAssignment(BaseModel):
    stage: str
    primary: str
    fallback: Optional[str] = None
