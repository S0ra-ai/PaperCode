"""认证端点 — 注册、登录、登出、用户信息、个人资料、密码修改"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session as DBSession

from app.platform.config import settings
from app.platform.exceptions import BusinessException, ForbiddenException
from app.platform.response import ApiResponse
from app.platform.security import create_access_token, hash_password, verify_password
from app.platform.database import get_db
from app.modules.auth.deps import CurrentUser, require_approved
from app.modules.auth.models import User
from app.modules.auth.schemas import (
    RegisterRequest, LoginRequest, UpdateProfileRequest,
    ChangePasswordRequest, UserInfoResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_to_dict(user: User) -> dict:
    return UserInfoResponse.model_validate(user).model_dump()


@router.post("/register")
def register(req: RegisterRequest, db: DBSession = Depends(get_db)):
    existing = db.query(User).filter(User.username == req.username).first()
    if existing:
        raise BusinessException(400, "用户名已存在")

    user = User(
        userId=str(uuid.uuid4()),
        username=req.username,
        password=hash_password(req.password),
        nickname=req.nickname,
        email=req.email,
        role=req.role,
        authStatus=0,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return ApiResponse.success("注册成功，请等待管理员审核", _user_to_dict(user))


@router.post("/login")
def login(req: LoginRequest, response: Response, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.password):
        raise BusinessException(400, "用户名或密码错误")

    if user.authStatus == 0:
        raise ForbiddenException("账号正在等待管理员审核")
    if user.authStatus == 2:
        raise ForbiddenException("账号已被禁用")

    token = create_access_token(user.username, user.userId, user.role)
    max_age = settings.JWT_EXPIRATION_HOURS * 3600
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        path="/",
        max_age=max_age,
    )
    return ApiResponse.success("登录成功", _user_to_dict(user))


@router.post("/logout")
def logout(
    response: Response,
    current_user: CurrentUser = Depends(require_approved),
):
    response.delete_cookie("access_token", path="/")
    return ApiResponse.success("已退出登录")


@router.get("/userinfo")
def get_userinfo(
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    user = db.query(User).filter(User.userId == current_user.user_id).first()
    if not user:
        raise BusinessException(404, "用户不存在")
    return ApiResponse.success("获取用户信息成功", _user_to_dict(user))


@router.get("/profile")
def get_profile(
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    """获取当前用户个人信息"""
    user = db.query(User).filter(User.userId == current_user.user_id).first()
    if not user:
        raise BusinessException(404, "用户不存在")
    return ApiResponse.success("获取个人信息成功", _user_to_dict(user))


@router.put("/profile")
def update_profile(
    req: UpdateProfileRequest,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    user = db.query(User).filter(User.userId == current_user.user_id).first()
    if not user:
        raise BusinessException(404, "用户不存在")

    if req.nickname is not None:
        user.nickname = req.nickname
    if req.email is not None:
        user.email = req.email
    if req.avatar is not None:
        user.avatar = req.avatar
    if req.realName is not None:
        user.realName = req.realName
    if req.institution is not None:
        user.institution = req.institution
    if req.department is not None:
        user.department = req.department
    if req.studentId is not None:
        user.studentId = req.studentId
    if req.orcid is not None:
        user.orcid = req.orcid
    if req.researchArea is not None:
        user.researchArea = req.researchArea

    db.commit()
    db.refresh(user)
    return ApiResponse.success("更新成功", _user_to_dict(user))


@router.put("/password")
def change_password(
    req: ChangePasswordRequest,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    user = db.query(User).filter(User.userId == current_user.user_id).first()
    if not user:
        raise BusinessException(404, "用户不存在")
    if not verify_password(req.oldPassword, user.password):
        raise BusinessException(400, "原密码错误")

    user.password = hash_password(req.newPassword)
    db.commit()
    return ApiResponse.success("密码修改成功")
