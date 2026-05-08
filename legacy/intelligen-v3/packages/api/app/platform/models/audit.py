"""Audit log models — maps to existing 'operation_logs' and 'admin_access_logs' tables."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import String, Integer, BigInteger, Text, Boolean, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column

from app.platform.database import Base


class OperationLog(Base):
    __tablename__ = "operation_logs"

    id: Mapped[int] = mapped_column("id", BigInteger, primary_key=True, autoincrement=True)
    requestId: Mapped[str] = mapped_column("requestId", String(36), nullable=False)
    upstreamRequestId: Mapped[str | None] = mapped_column("upstreamRequestId", String(128), nullable=True)
    traceId: Mapped[str] = mapped_column("traceId", String(64), nullable=False)
    operatorUserId: Mapped[str] = mapped_column("operatorUserId", String(36), nullable=False)
    operatorUsername: Mapped[str] = mapped_column("operatorUsername", String(255), nullable=False)
    operatorRole: Mapped[str] = mapped_column("operatorRole", String(50), nullable=False)
    actionCode: Mapped[str] = mapped_column("actionCode", String(80), nullable=False)
    actionName: Mapped[str] = mapped_column("actionName", String(255), nullable=False)
    resourceType: Mapped[str | None] = mapped_column("resourceType", String(80), nullable=True)
    resourceId: Mapped[str | None] = mapped_column("resourceId", String(64), nullable=True)
    requestMethod: Mapped[str] = mapped_column("requestMethod", String(10), nullable=False)
    requestPath: Mapped[str] = mapped_column("requestPath", String(255), nullable=False)
    responseStatus: Mapped[int] = mapped_column("responseStatus", Integer, nullable=False)
    success: Mapped[bool] = mapped_column("success", Boolean, nullable=False)
    summary: Mapped[str] = mapped_column("summary", String(255), nullable=False)
    detail: Mapped[str | None] = mapped_column("detail", Text, nullable=True)
    errorMessage: Mapped[str | None] = mapped_column("errorMessage", String(500), nullable=True)
    clientIp: Mapped[str | None] = mapped_column("clientIp", String(64), nullable=True)
    userAgent: Mapped[str | None] = mapped_column("userAgent", String(512), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, server_default=func.now()
    )


class AdminAccessLog(Base):
    __tablename__ = "admin_access_logs"

    id: Mapped[int] = mapped_column("id", BigInteger, primary_key=True, autoincrement=True)
    requestId: Mapped[str] = mapped_column("requestId", String(36), nullable=False)
    upstreamRequestId: Mapped[str | None] = mapped_column("upstreamRequestId", String(128), nullable=True)
    traceId: Mapped[str] = mapped_column("traceId", String(64), nullable=False)
    operatorUserId: Mapped[str] = mapped_column("operatorUserId", String(36), nullable=False)
    operatorUsername: Mapped[str] = mapped_column("operatorUsername", String(255), nullable=False)
    operatorRole: Mapped[str] = mapped_column("operatorRole", String(50), nullable=False)
    actionCode: Mapped[str] = mapped_column("actionCode", String(80), nullable=False)
    actionName: Mapped[str] = mapped_column("actionName", String(255), nullable=False)
    triggerSource: Mapped[str] = mapped_column("triggerSource", String(50), nullable=False)
    requestMethod: Mapped[str] = mapped_column("requestMethod", String(10), nullable=False)
    requestPath: Mapped[str] = mapped_column("requestPath", String(255), nullable=False)
    responseStatus: Mapped[int] = mapped_column("responseStatus", Integer, nullable=False)
    success: Mapped[bool] = mapped_column("success", Boolean, nullable=False)
    summary: Mapped[str] = mapped_column("summary", String(255), nullable=False)
    detail: Mapped[str | None] = mapped_column("detail", Text, nullable=True)
    clientIp: Mapped[str | None] = mapped_column("clientIp", String(64), nullable=True)
    userAgent: Mapped[str | None] = mapped_column("userAgent", String(512), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(
        "createdAt", DateTime, nullable=False, server_default=func.now()
    )
