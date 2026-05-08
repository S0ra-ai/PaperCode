"""管理后台端点 — 用户审核、会话管理、审计日志、仪表盘、模型配置、系统健康"""

from __future__ import annotations

import logging
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session as DBSession

from app.platform.exceptions import NotFoundException
from app.platform.response import ApiResponse, PageResponse
from app.platform.database import get_db
from app.platform.config import settings as api_settings
from app.modules.auth.deps import CurrentUser, require_admin
from app.modules.auth.models import User
from app.modules.workspace.models.session import Session
from app.modules.workspace.models.task import GenerateTask
from app.platform.models.audit import OperationLog
from app.modules.admin.schemas import (
    UserAuditRequest,
    PendingUserResponse,
    AuditLogResponse,
    UserDetailResponse,
    ModelConfigRequest,
)
from app.modules.admin.models_config import LLMModelConfig

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

ENGINE_BASE = api_settings.ENGINE_BASE_URL


async def _engine_get(path: str, params: dict | None = None, timeout: float = 10) -> dict:
    """向引擎服务发送GET请求"""
    try:
        async with httpx.AsyncClient(timeout=timeout, trust_env=False) as client:
            resp = await client.get(f"{ENGINE_BASE}{path}", params=params)
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("Engine request failed (%s): %s", path, exc)
        return {}


# ─── 已有端点 ──────────────────────────────────────────────


@router.get("/users/pending")
def list_pending_users(
    page: int = Query(1, ge=1),
    pageSize: int = Query(10, ge=1, le=100),
    keyword: str = "",
    role: str = "",
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    query = db.query(User).filter(User.authStatus == 0)

    if keyword:
        like = f"%{keyword}%"
        query = query.filter(
            or_(User.username.like(like), User.nickname.like(like), User.email.like(like))
        )
    if role:
        query = query.filter(User.role == role)

    total = query.count()
    users = (
        query.order_by(desc(User.createdAt))
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    items = [PendingUserResponse.model_validate(u).model_dump() for u in users]
    return ApiResponse.success("获取用户列表成功", PageResponse.of(items, page, pageSize, total))


@router.put("/users/{user_id}/audit")
def audit_user(
    user_id: str,
    req: UserAuditRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    user = db.query(User).filter(User.userId == user_id).first()
    if not user:
        raise NotFoundException("用户不存在")

    user.authStatus = req.authStatus
    db.commit()
    status_text = "已通过" if req.authStatus == 1 else "已禁用"
    return ApiResponse.success(f"用户审核{status_text}")


@router.delete("/sessions/{session_id}")
def admin_delete_session(
    session_id: str,
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    session = db.query(Session).filter(Session.sessionId == session_id).first()
    if not session:
        raise NotFoundException("会话不存在")

    db.delete(session)
    db.commit()
    return ApiResponse.success("会话删除成功")


@router.get("/audit-logs")
def list_audit_logs(
    page: int = Query(1, ge=1),
    pageSize: int = Query(10, ge=1, le=100),
    keyword: str = "",
    actionCode: str = "",
    requestId: str = "",
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    query = db.query(OperationLog)

    if keyword:
        like = f"%{keyword}%"
        query = query.filter(
            or_(
                OperationLog.operatorUsername.like(like),
                OperationLog.summary.like(like),
                OperationLog.actionName.like(like),
            )
        )
    if actionCode:
        query = query.filter(OperationLog.actionCode == actionCode)
    if requestId:
        query = query.filter(OperationLog.requestId == requestId)

    total = query.count()
    logs = (
        query.order_by(desc(OperationLog.createdAt))
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    items = [AuditLogResponse.model_validate(lg).model_dump() for lg in logs]
    return ApiResponse.success("获取审计日志成功", PageResponse.of(items, page, pageSize, total))


# ─── 仪表盘与指标 ──────────────────────────────────────────


@router.get("/dashboard")
async def get_dashboard(
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """仪表盘概览 — 活跃任务、系统健康、近期活动"""
    total_users = db.query(func.count(User.userId)).scalar() or 0
    total_sessions = db.query(func.count(Session.sessionId)).scalar() or 0
    total_tasks = db.query(func.count(GenerateTask.taskId)).scalar() or 0

    # 近期任务
    recent_tasks = (
        db.query(GenerateTask)
        .order_by(desc(GenerateTask.createdAt))
        .limit(10)
        .all()
    )
    recent = []
    for t in recent_tasks:
        recent.append({
            "taskId": t.taskId,
            "sessionId": t.sessionId,
            "topic": t.userInput,
            "status": t.status,
            "createdAt": t.createdAt.isoformat() if t.createdAt else None,
        })

    # 引擎健康状态
    engine_health = await _engine_get("/health")
    engine_metrics = await _engine_get("/engine/metrics")

    return ApiResponse.success("获取仪表盘数据成功", {
        "total_users": total_users,
        "total_sessions": total_sessions,
        "total_tasks": total_tasks,
        "active_tasks": engine_metrics.get("active_tasks", 0),
        "queue_depth": engine_metrics.get("queue_depth", 0),
        "engine_status": engine_health.get("status", "unknown"),
        "recent_tasks": recent,
    })


@router.get("/metrics/realtime")
async def get_realtime_metrics(current_user: CurrentUser = Depends(require_admin)):
    """实时RPM、TPM、活跃任务"""
    engine_metrics = await _engine_get("/engine/metrics")
    return ApiResponse.success("获取实时指标成功", engine_metrics)


@router.get("/metrics/usage")
async def get_usage_stats(
    days: int = Query(7, ge=1, le=90),
    current_user: CurrentUser = Depends(require_admin),
):
    """按模型按天统计Token消耗"""
    # 代理至引擎获取详细指标
    data = await _engine_get("/engine/metrics/usage", params={"days": days})
    return ApiResponse.success("获取使用统计成功", data)


# ─── 模型配置 ──────────────────────────────────────────────


@router.get("/models")
async def list_models(
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """列出所有已配置的LLM模型及状态"""
    # 数据库配置
    db_configs = db.query(LLMModelConfig).all()
    db_map = {c.id: c.to_dict() for c in db_configs}

    # 引擎模型
    engine_models = await _engine_get("/engine/models")

    # 合并: 数据库配置优先，引擎默认值兜底
    default_models = [
        {
            "id": "chat",
            "name": "Qwen3 235B (Writing/Planning/Review)",
            "provider": "openrouter",
            "model_id": engine_models.get("chat", api_settings.LLM_CHAT_MODEL),
            "model_type": "writing",
            "is_active": True,
            "rpm_limit": 60,
            "tpm_limit": 100000,
            "config_json": {"temperature": 0.3, "max_tokens": 32768},
        },
        {
            "id": "fast",
            "name": "Qwen3 30B (Fast/Summary/Clarify)",
            "provider": "openrouter",
            "model_id": engine_models.get("fast", api_settings.LLM_FAST_MODEL),
            "model_type": "fast",
            "is_active": True,
            "rpm_limit": 60,
            "tpm_limit": 100000,
            "config_json": {"temperature": 0.0, "max_tokens": 8192},
        },
        {
            "id": "code",
            "name": "Qwen Coder Plus (Code Analysis)",
            "provider": "openrouter",
            "model_id": engine_models.get("code", "qwen/qwen-coder-plus"),
            "model_type": "code",
            "is_active": True,
            "rpm_limit": 60,
            "tpm_limit": 100000,
            "config_json": {"temperature": 0.0, "max_tokens": 8192},
        },
        {
            "id": "search",
            "name": "Perplexity Sonar Pro (Search)",
            "provider": "openrouter",
            "model_id": engine_models.get("search", "perplexity/sonar-pro"),
            "model_type": "search",
            "is_active": True,
            "rpm_limit": 30,
            "tpm_limit": 50000,
            "config_json": {"temperature": 0.0, "max_tokens": 4096},
        },
        {
            "id": "embedding",
            "name": "BGE-M3 (Embedding)",
            "provider": "local",
            "model_id": engine_models.get("embedding", "BAAI/bge-m3"),
            "model_type": "embedding",
            "is_active": True,
            "rpm_limit": 0,
            "tpm_limit": 0,
            "config_json": {},
        },
    ]

    # 覆盖数据库配置
    models = []
    for dm in default_models:
        if dm["id"] in db_map:
            models.append(db_map[dm["id"]])
        else:
            models.append(dm)

    # 追加数据库独有配置
    for cid, cdata in db_map.items():
        if cid not in {m["id"] for m in models}:
            models.append(cdata)

    return ApiResponse.success("获取模型列表成功", models)


@router.put("/models/{model_id}")
def update_model_config(
    model_id: str,
    config: ModelConfigRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """更新模型配置 (仅管理员)"""
    existing = db.query(LLMModelConfig).filter(LLMModelConfig.id == model_id).first()

    if existing:
        if config.name is not None:
            existing.name = config.name
        if config.provider is not None:
            existing.provider = config.provider
        if config.model_id is not None:
            existing.model_id = config.model_id
        if config.model_type is not None:
            existing.model_type = config.model_type
        if config.is_active is not None:
            existing.is_active = config.is_active
        if config.rpm_limit is not None:
            existing.rpm_limit = config.rpm_limit
        if config.tpm_limit is not None:
            existing.tpm_limit = config.tpm_limit
        if config.config_json is not None:
            existing.config_json = config.config_json
    else:
        new_config = LLMModelConfig(
            id=model_id,
            name=config.name or model_id,
            provider=config.provider or "openrouter",
            model_id=config.model_id or model_id,
            model_type=config.model_type or "writing",
            is_active=config.is_active if config.is_active is not None else True,
            rpm_limit=config.rpm_limit or 60,
            tpm_limit=config.tpm_limit or 100000,
            config_json=config.config_json,
        )
        db.add(new_config)

    db.commit()
    return ApiResponse.success("模型配置已更新")


# ─── 系统健康 ──────────────────────────────────────────────


@router.get("/system/health")
async def system_health(current_user: CurrentUser = Depends(require_admin)):
    """Redis、数据库、引擎、COS健康检查"""
    health = {
        "api": "up",
        "database": "unknown",
        "redis": "unknown",
        "engine": "unknown",
    }

    # 数据库
    try:
        from app.platform.database import SessionLocal
        db = SessionLocal()
        try:
            from sqlalchemy import text
            db.execute(text("SELECT 1"))
            health["database"] = "up"
        finally:
            db.close()
    except Exception:
        health["database"] = "down"

    # Redis
    try:
        from app.core.redis import get_redis, redis_available
        if redis_available():
            rc = get_redis()
            rc.ping()
            health["redis"] = "up"
        else:
            health["redis"] = "unavailable"
    except Exception:
        try:
            import redis
            rc = redis.from_url(api_settings.REDIS_URL, socket_timeout=3)
            rc.ping()
            health["redis"] = "up"
        except Exception:
            health["redis"] = "down"

    # 引擎
    engine_data = await _engine_get("/health", timeout=5)
    health["engine"] = engine_data.get("status", "down")

    return ApiResponse.success("系统健康检查完成", health)


# ─── 用户管理 ──────────────────────────────────────────────


@router.get("/users")
def list_users(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    keyword: str = "",
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """列出所有用户及使用统计"""
    query = db.query(User)

    if keyword:
        like = f"%{keyword}%"
        query = query.filter(
            or_(User.username.like(like), User.nickname.like(like), User.email.like(like))
        )

    total = query.count()
    users = (
        query.order_by(desc(User.createdAt))
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )

    items = []
    for u in users:
        task_count = (
            db.query(func.count(GenerateTask.taskId))
            .join(Session, GenerateTask.sessionId == Session.sessionId)
            .filter(Session.userId == u.userId)
            .scalar()
        ) or 0
        session_count = (
            db.query(func.count(Session.sessionId))
            .filter(Session.userId == u.userId)
            .scalar()
        ) or 0
        items.append(
            UserDetailResponse(
                userId=u.userId,
                username=u.username,
                nickname=u.nickname,
                email=u.email,
                role=u.role,
                authStatus=u.authStatus,
                createdAt=u.createdAt,
                taskCount=task_count,
                sessionCount=session_count,
            ).model_dump()
        )

    return ApiResponse.success("获取用户列表成功", PageResponse.of(items, page, pageSize, total))


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: str,
    role: str = Query(..., description="New role"),
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """更新用户角色 (仅管理员)"""
    from app.modules.auth.enums import UserRole
    valid_roles = {r.value for r in UserRole}
    if role not in valid_roles:
        return ApiResponse.failure(400, f"Invalid role. Must be one of: {valid_roles}")

    user = db.query(User).filter(User.userId == user_id).first()
    if not user:
        raise NotFoundException("用户不存在")

    if user.userId == current_user.user_id:
        return ApiResponse.failure(400, "不能修改自己的角色")

    user.role = role
    db.commit()
    return ApiResponse.success(f"用户角色已更新为 {role}")
