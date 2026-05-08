"""LLM Provider / Stage 配置 — SQLAlchemy 模型"""

from __future__ import annotations

from sqlalchemy import (
    Column, String, Integer, Text, JSON, Boolean, DateTime, ForeignKey, func,
)

from app.platform.database import Base


class LLMProvider(Base):
    """LLM 提供商配置"""

    __tablename__ = "llm_providers"

    id = Column(String(64), primary_key=True)
    name = Column(String(200), nullable=False, unique=True)
    api_format = Column(String(30), nullable=False,
                        comment="openai_compatible | anthropic | google")
    base_url = Column(String(500), nullable=False)
    api_key_encrypted = Column(Text, nullable=True)
    models_json = Column(JSON, nullable=True, comment="可用模型 ID 列表")
    deployment_type = Column(String(20), nullable=False, server_default="cloud")
    auth_required = Column(Boolean, nullable=False, server_default="1")
    is_active = Column(Boolean, nullable=False, server_default="1")
    priority = Column(Integer, nullable=False, server_default="0")
    health_status = Column(String(20), nullable=False, server_default="unknown")
    health_checked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "api_format": self.api_format,
            "base_url": self.base_url,
            "has_api_key": bool(self.api_key_encrypted),
            "models_json": self.models_json,
            "deployment_type": self.deployment_type,
            "auth_required": self.auth_required,
            "is_active": self.is_active,
            "priority": self.priority,
            "health_status": self.health_status,
            "health_checked_at": (
                self.health_checked_at.isoformat() if self.health_checked_at else None
            ),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class LLMStageConfig(Base):
    """Stage 粒度的 LLM 分配"""

    __tablename__ = "llm_stage_configs"

    id = Column(String(64), primary_key=True)
    stage = Column(String(50), nullable=False)
    provider_id = Column(
        String(64),
        ForeignKey("llm_providers.id", ondelete="CASCADE"),
        nullable=False,
    )
    model = Column(String(200), nullable=False)
    is_fallback = Column(Boolean, nullable=False, server_default="0")
    priority = Column(Integer, nullable=False, server_default="0")
    created_at = Column(DateTime, server_default=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "stage": self.stage,
            "provider_id": self.provider_id,
            "model": self.model,
            "is_fallback": self.is_fallback,
            "priority": self.priority,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
