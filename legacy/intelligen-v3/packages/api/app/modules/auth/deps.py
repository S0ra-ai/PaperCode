"""FastAPI依赖项 — 认证提取、数据库会话等"""

from __future__ import annotations

from fastapi import Depends, Request
from sqlalchemy.orm import Session as DBSession

from app.platform.exceptions import UnauthorizedException, ForbiddenException
from app.platform.security import verify_token
from app.platform.database import get_db
from app.modules.auth.models import User
from app.modules.auth.enums import UserRole


class CurrentUser:
    """当前请求的JWT解码信息"""

    def __init__(self, user_id: str, username: str, role: str) -> None:
        self.user_id = user_id
        self.username = username
        self.role = role


def get_current_user(request: Request) -> CurrentUser:
    """从httpOnly Cookie或Authorization头提取JWT"""
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise UnauthorizedException("请先登录")

    claims = verify_token(token)
    if claims is None:
        raise UnauthorizedException("登录已过期，请重新登录")

    user = CurrentUser(
        user_id=claims.get("userId", ""),
        username=claims.get("sub", ""),
        role=claims.get("role", ""),
    )
    # 挂载到 request.state 供审计中间件使用
    request.state.user = user
    # 绑定用户上下文用于结构化日志
    import structlog.contextvars
    structlog.contextvars.bind_contextvars(user_id=user.user_id)
    return user


def require_approved(
    current_user: CurrentUser = Depends(get_current_user),
    db: DBSession = Depends(get_db),
) -> CurrentUser:
    """校验用户已通过管理员审核 (authStatus=1)"""
    user = db.query(User).filter(User.userId == current_user.user_id).first()
    if not user:
        raise UnauthorizedException("用户不存在")
    if user.authStatus != 1:
        raise ForbiddenException("账号尚未通过审核或已被禁用")
    return current_user


def require_admin(
    current_user: CurrentUser = Depends(require_approved),
) -> CurrentUser:
    """要求管理员角色"""
    if current_user.role != UserRole.ADMIN:
        raise ForbiddenException("需要管理员权限")
    return current_user
