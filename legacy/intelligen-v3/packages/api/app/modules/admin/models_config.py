"""LLM模型配置 — 双层架构 (环境变量 + 数据库)

管理员通过数据库管理模型配置，环境变量作为默认回退。
"""

from __future__ import annotations

from sqlalchemy import Column, String, Integer, JSON, Boolean, DateTime, func

from app.platform.database import Base


class LLMModelConfig(Base):
    """持久化的LLM模型配置 (管理员维护)"""

    __tablename__ = "llm_model_configs"

    id = Column(String(64), primary_key=True)
    name = Column(String(200), nullable=False)
    provider = Column(String(50), default="openrouter")  # openrouter, local, etc.
    model_id = Column(String(200), nullable=False)  # e.g. "qwen/qwen3-235b-a22b"
    model_type = Column(String(50), nullable=False)  # writing, fast, code, search, embedding
    is_active = Column(Boolean, default=True)
    rpm_limit = Column(Integer, default=60)
    tpm_limit = Column(Integer, default=100000)
    config_json = Column(JSON, nullable=True)  # temperature, max_tokens, etc.
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider,
            "model_id": self.model_id,
            "model_type": self.model_type,
            "is_active": self.is_active,
            "rpm_limit": self.rpm_limit,
            "tpm_limit": self.tpm_limit,
            "config_json": self.config_json,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
