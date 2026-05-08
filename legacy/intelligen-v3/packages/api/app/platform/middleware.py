"""CORS, request-ID, setup-guard, and audit-logging middleware."""

from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from typing import Optional

import structlog.contextvars
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.platform.database import SessionLocal
from app.platform.models.audit import OperationLog

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Route → action mapping (mirrors Java AuditRequestResolver)
# ---------------------------------------------------------------------------

_SKIP_PATHS = {"/admin/audit-logs", "/admin/access-logs", "/api/health"}

# (method, regex_pattern) → (actionCode, actionName)
_OPERATION_RULES: list[tuple[str, re.Pattern, str, str]] = [
    ("POST",   re.compile(r"^/sessions$"),                          "ADMIN_CREATE_SESSION",             "创建会话"),
    ("DELETE", re.compile(r"^/sessions/[^/]+$"),                    "ADMIN_DELETE_SESSION",             "删除会话"),
    ("POST",   re.compile(r"^/sessions/[^/]+/tasks$"),              "ADMIN_CREATE_TASK",                "提交生成任务"),
    ("POST",   re.compile(r"^/sessions/[^/]+/attachments$"),        "ADMIN_UPLOAD_SESSION_ATTACHMENT",  "上传会话附件"),
    ("POST",   re.compile(r"^/files/upload$"),                      "ADMIN_UPLOAD_FILE",                "上传文件"),
    ("DELETE", re.compile(r"^/files/[^/]+$"),                       "ADMIN_DELETE_FILE",                "删除文件"),
    ("PUT",    re.compile(r"^/auth/profile$"),                      "ADMIN_UPDATE_PROFILE",             "更新个人信息"),
    ("PUT",    re.compile(r"^/auth/password$"),                     "ADMIN_UPDATE_PASSWORD",            "修改密码"),
    ("PUT",    re.compile(r"^/admin/users/[^/]+/audit$"),           "ADMIN_AUDIT_USER",                 "审核用户"),
    ("DELETE", re.compile(r"^/admin/sessions/[^/]+$"),              "ADMIN_FORCE_DELETE_SESSION",       "强制删除会话"),
    ("GET",    re.compile(r"^/tasks/[^/]+/download$"),              "ADMIN_DOWNLOAD_REPORT",            "下载报告"),
    ("POST",   re.compile(r"^/auth/login$"),                        "ADMIN_LOGIN",                      "用户登录"),
    ("POST",   re.compile(r"^/auth/register$"),                     "USER_REGISTER",                    "用户注册"),
    ("POST",   re.compile(r"^/auth/logout$"),                       "USER_LOGOUT",                      "用户登出"),
]


def _resolve_action(method: str, path: str) -> Optional[tuple[str, str]]:
    """Return (actionCode, actionName) or None if not auditable."""
    for rule_method, pattern, code, name in _OPERATION_RULES:
        if method == rule_method and pattern.match(path):
            return code, name
    return None


def _extract_resource(path: str) -> tuple[Optional[str], Optional[str]]:
    """Guess resourceType + resourceId from the URL."""
    parts = [p for p in path.split("/") if p]
    if len(parts) >= 2:
        return parts[0], parts[1]
    return None, None


# ---------------------------------------------------------------------------
# Request-ID middleware
# ---------------------------------------------------------------------------

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Attach X-Request-Id and X-Trace-Id to every request/response."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
        trace_id = request.headers.get("X-Trace-Id", str(uuid.uuid4()))
        request.state.request_id = request_id
        request.state.trace_id = trace_id
        request.state.start_time = time.time()

        # Bind request context for structured logging
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id, trace_id=trace_id)

        try:
            response = await call_next(request)
            response.headers["X-Request-Id"] = request_id
            response.headers["X-Trace-Id"] = trace_id
            return response
        finally:
            structlog.contextvars.unbind_contextvars("request_id", "trace_id", "user_id")


# ---------------------------------------------------------------------------
# Setup-guard middleware — returns 503 when system is not initialized
# ---------------------------------------------------------------------------

# Paths that are always allowed (setup, health, static assets)
_SETUP_ALLOW_PREFIXES = ("/setup", "/api/health", "/swagger-ui", "/v3/api-docs", "/uploads", "/openapi.json")


class SetupGuardMiddleware(BaseHTTPMiddleware):
    """Block all non-setup requests with 503 when no admin user exists.

    The check result is cached to avoid hitting the DB on every request.
    Cache is invalidated when /setup/init or /setup/complete is called.
    """

    def __init__(self, app, **kwargs):
        super().__init__(app, **kwargs)
        self._initialized: Optional[bool] = None

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path

        # Always allow setup-related and static paths
        if any(path.startswith(p) for p in _SETUP_ALLOW_PREFIXES):
            response = await call_next(request)
            # Invalidate cache after successful setup mutation
            if path in ("/setup/init", "/setup/complete") and request.method == "POST":
                self._initialized = None
            return response

        # OPTIONS / HEAD are always allowed (CORS preflight, etc.)
        if request.method in ("OPTIONS", "HEAD"):
            return await call_next(request)

        # Check initialization status (cached)
        if not self._is_initialized():
            return JSONResponse(
                status_code=503,
                content={"setup_required": True, "message": "系统尚未初始化，请先完成设置向导。"},
            )

        return await call_next(request)

    def _is_initialized(self) -> bool:
        if self._initialized is not None:
            return self._initialized

        from sqlalchemy import func as sa_func
        from app.modules.auth.models import User
        from app.modules.auth.enums import UserRole

        db = SessionLocal()
        try:
            count = db.query(sa_func.count(User.userId)).filter(User.role == UserRole.ADMIN).scalar() or 0
            self._initialized = count > 0
        except Exception:
            # If DB is unreachable, don't block — let the request through
            self._initialized = True
        finally:
            db.close()

        return self._initialized


# ---------------------------------------------------------------------------
# Audit-logging middleware
# ---------------------------------------------------------------------------

class AuditLogMiddleware(BaseHTTPMiddleware):
    """Record auditable operations to the operation_logs table (background)."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        method = request.method.upper()

        # Skip non-auditable
        if path in _SKIP_PATHS or method in ("OPTIONS", "HEAD"):
            return await call_next(request)

        action = _resolve_action(method, path)
        if action is None:
            return await call_next(request)

        action_code, action_name = action

        response = await call_next(request)

        # Non-blocking: run DB write in thread pool
        try:
            log_data = _build_audit_data(request, response, action_code, action_name)
            asyncio.get_event_loop().create_task(
                asyncio.to_thread(_persist_audit_log, log_data)
            )
        except Exception:
            logger.warning("Failed to schedule audit log for %s %s", method, path, exc_info=True)

        return response


def _build_audit_data(request: Request, response: Response, action_code: str, action_name: str) -> dict:
    """Extract all needed data from request/response before async handoff."""
    user = getattr(request.state, "user", None)
    return {
        "request_id": getattr(request.state, "request_id", str(uuid.uuid4())),
        "trace_id": getattr(request.state, "trace_id", str(uuid.uuid4())),
        "user_id": user.user_id if user else "anonymous",
        "username": user.username if user else "anonymous",
        "role": user.role if user else "anonymous",
        "action_code": action_code,
        "action_name": action_name,
        "method": request.method.upper(),
        "path": request.url.path,
        "status_code": response.status_code,
        "client_ip": request.client.host if request.client else None,
        "user_agent": (request.headers.get("user-agent") or "")[:512],
    }


def _persist_audit_log(log_data: dict) -> None:
    """Synchronous DB write — called via asyncio.to_thread()."""
    resource_type, resource_id = _extract_resource(log_data["path"])
    status_code = log_data["status_code"]

    log = OperationLog(
        requestId=log_data["request_id"],
        traceId=log_data["trace_id"],
        operatorUserId=log_data["user_id"],
        operatorUsername=log_data["username"],
        operatorRole=log_data["role"],
        actionCode=log_data["action_code"],
        actionName=log_data["action_name"],
        resourceType=resource_type,
        resourceId=resource_id,
        requestMethod=log_data["method"],
        requestPath=log_data["path"],
        responseStatus=status_code,
        success=200 <= status_code < 400,
        summary=f"{log_data['action_name']} — {log_data['method']} {log_data['path']}",
        clientIp=log_data["client_ip"],
        userAgent=log_data["user_agent"],
    )

    db = SessionLocal()
    try:
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
