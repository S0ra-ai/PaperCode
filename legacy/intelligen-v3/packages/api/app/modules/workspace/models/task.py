"""Task models — maps to existing 'generate_tasks' and 'generate_task_files' tables."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    String, Text, Integer, DateTime, ForeignKey, Numeric, Index, func,
)
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.platform.database import Base


class GenerateTaskFile(Base):
    __tablename__ = "generate_task_files"

    taskId: Mapped[str] = mapped_column(
        "taskId", String(36), ForeignKey("generate_tasks.taskId"), primary_key=True
    )
    fileId: Mapped[str] = mapped_column("fileId", String(36), primary_key=True)
    fileNameSnapshot: Mapped[str] = mapped_column("fileNameSnapshot", String(255), nullable=False)
    createdAt: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, server_default=func.now()
    )


class GenerateTask(Base):
    __tablename__ = "generate_tasks"

    taskId: Mapped[str] = mapped_column("taskId", String(36), primary_key=True)
    sessionId: Mapped[str] = mapped_column(
        "sessionId", String(36), ForeignKey("sessions.sessionId"), nullable=False, index=True
    )
    externalTaskId: Mapped[str | None] = mapped_column("externalTaskId", String(64), nullable=True)
    status: Mapped[str] = mapped_column("status", String(50), nullable=False, default="pending", index=True)
    userInput: Mapped[str] = mapped_column("userInput", Text, nullable=False)
    outline: Mapped[str | None] = mapped_column("outline", Text, nullable=True)
    templateFileId: Mapped[str | None] = mapped_column("templateFileId", String(36), nullable=True)
    templateFileName: Mapped[str | None] = mapped_column("templateFileName", String(255), nullable=True)
    templateFileType: Mapped[str | None] = mapped_column("templateFileType", String(50), nullable=True)
    progress: Mapped[Decimal | None] = mapped_column("progress", Numeric(5, 2), nullable=True)
    currentSection: Mapped[int | None] = mapped_column("currentSection", Integer, nullable=True)
    totalSections: Mapped[int | None] = mapped_column("totalSections", Integer, nullable=True)
    resultMarkdown: Mapped[str | None] = mapped_column("resultMarkdown", LONGTEXT, nullable=True)
    resultFileId: Mapped[str | None] = mapped_column("resultFileId", String(36), nullable=True)
    resultFileName: Mapped[str | None] = mapped_column("resultFileName", String(255), nullable=True)
    resultFileType: Mapped[str | None] = mapped_column("resultFileType", String(50), nullable=True)
    citationStyle: Mapped[str | None] = mapped_column("citationStyle", String(20), default="gb", nullable=True)
    errorMessage: Mapped[str | None] = mapped_column("errorMessage", Text, nullable=True)
    retryCount: Mapped[int] = mapped_column("retryCount", Integer, default=0)
    maxRetries: Mapped[int] = mapped_column("maxRetries", Integer, default=3)
    createdAt: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, server_default=func.now()
    )
    updatedAt: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
    completedAt: Mapped[datetime | None] = mapped_column("completedAt", DateTime, nullable=True)

    session = relationship("Session", back_populates="tasks")
    task_files = relationship("GenerateTaskFile", cascade="all, delete-orphan", lazy="selectin")

    __table_args__ = (
        Index("ix_generate_tasks_session_created", "sessionId", "createdAt"),
        Index("ix_generate_tasks_status_created", "status", "createdAt"),
    )
