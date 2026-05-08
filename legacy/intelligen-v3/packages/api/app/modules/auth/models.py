"""用户模型 — 映射 users 表"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.platform.database import Base


class User(Base):
    __tablename__ = "users"

    userId: Mapped[str] = mapped_column("userId", String(36), primary_key=True)
    username: Mapped[str] = mapped_column("username", String(255), unique=True, nullable=False)
    password: Mapped[str] = mapped_column("password", String(255), nullable=False)
    nickname: Mapped[str] = mapped_column("nickname", String(255), nullable=False)
    email: Mapped[str] = mapped_column("email", String(255), nullable=False)
    role: Mapped[str] = mapped_column("role", String(50), nullable=False)
    authStatus: Mapped[int] = mapped_column("authStatus", Integer, nullable=False, default=0)
    avatar: Mapped[str | None] = mapped_column("avatar", String(255), nullable=True)

    # 作者信息 — 论文生成时自动填入
    realName: Mapped[str | None] = mapped_column("realName", String(100), nullable=True)
    institution: Mapped[str | None] = mapped_column("institution", String(200), nullable=True)
    department: Mapped[str | None] = mapped_column("department", String(200), nullable=True)
    studentId: Mapped[str | None] = mapped_column("studentId", String(50), nullable=True)
    orcid: Mapped[str | None] = mapped_column("orcid", String(50), nullable=True)
    researchArea: Mapped[str | None] = mapped_column("researchArea", String(500), nullable=True)

    createdAt: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, server_default=func.now()
    )
    updatedAt: Mapped[datetime] = mapped_column(
        "updatedAt", DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")
    files = relationship("StoredFile", back_populates="user", cascade="all, delete-orphan")
