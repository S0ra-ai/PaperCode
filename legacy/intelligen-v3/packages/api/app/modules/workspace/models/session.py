"""Session model — maps to existing 'sessions' table."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Text, DateTime, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.platform.database import Base


class Session(Base):
    __tablename__ = "sessions"

    sessionId: Mapped[str] = mapped_column("sessionId", String(36), primary_key=True)
    userId: Mapped[str] = mapped_column("userId", String(36), ForeignKey("users.userId"), nullable=False, index=True)
    title: Mapped[str] = mapped_column("title", Text, nullable=False)
    createdAt: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, server_default=func.now()
    )
    updatedAt: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="sessions")
    tasks = relationship("GenerateTask", back_populates="session", cascade="all, delete-orphan")
    attachments = relationship(
        "StoredFile",
        primaryjoin="Session.sessionId == foreign(StoredFile.sourceSessionId)",
        viewonly=True,
    )

    __table_args__ = (
        Index("ix_sessions_user_updated", "userId", "updatedAt"),
    )
