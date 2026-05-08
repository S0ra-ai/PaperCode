"""File storage model — maps to existing 'files' table."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, BigInteger, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.platform.database import Base


class StoredFile(Base):
    __tablename__ = "files"

    fileId: Mapped[str] = mapped_column("fileId", String(36), primary_key=True)
    userId: Mapped[str] = mapped_column("userId", String(36), ForeignKey("users.userId"), nullable=False)
    fileName: Mapped[str] = mapped_column("fileName", String(255), nullable=False)
    filePath: Mapped[str] = mapped_column("filePath", String(255), nullable=False)
    fileUrl: Mapped[str] = mapped_column("fileUrl", String(500), nullable=False)
    fileSize: Mapped[int] = mapped_column("fileSize", BigInteger, nullable=False)
    fileType: Mapped[str] = mapped_column("fileType", String(50), nullable=False)
    sourceSessionId: Mapped[str | None] = mapped_column(
        "sourceSessionId", String(36), ForeignKey("sessions.sessionId", ondelete="CASCADE"), nullable=True
    )
    availableUntil: Mapped[datetime | None] = mapped_column("availableUntil", DateTime, nullable=True)
    createdAt: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, server_default=func.now()
    )
    updatedAt: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    user = relationship("User", back_populates="files")
