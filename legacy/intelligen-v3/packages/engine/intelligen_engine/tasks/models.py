"""引擎任务持久化模型 (PostgreSQL)。"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, String, Float, Text, DateTime, JSON, Index
from sqlalchemy.sql import func

from intelligen_engine.core.database import Base


class EngineTask(Base):
    """生成任务的持久化记录, 存储于 PostgreSQL。"""

    __tablename__ = "engine_tasks"

    task_id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=True)
    session_id = Column(String(64), nullable=True)
    status = Column(String(20), default="pending", index=True)
    progress = Column(Float, default=0.0)
    current_stage = Column(String(50), nullable=True)
    topic = Column(Text, nullable=True)
    requirement = Column(Text, nullable=True)
    result_markdown = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    task_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_engine_tasks_session_id", "session_id"),
    )

    def __repr__(self) -> str:
        return f"<EngineTask task_id={self.task_id!r} status={self.status!r}>"
