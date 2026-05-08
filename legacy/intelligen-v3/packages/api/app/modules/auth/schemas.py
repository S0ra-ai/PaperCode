"""认证请求/响应模型 — 对应Java后端DTO"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, EmailStr

from app.modules.auth.enums import UserRole

# 注册时排除admin角色 — 管理员通过初始化向导创建
RegistrationRole = Literal["student", "teacher", "user"]


class RegisterRequest(BaseModel):
    username: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6, max_length=100)
    nickname: str = Field(..., max_length=255)
    email: EmailStr
    role: RegistrationRole


class LoginRequest(BaseModel):
    username: str
    password: str


class UpdateProfileRequest(BaseModel):
    nickname: str | None = Field(None, max_length=255)
    email: EmailStr | None = None
    avatar: str | None = Field(None, max_length=255)
    realName: str | None = Field(None, max_length=100)
    institution: str | None = Field(None, max_length=200)
    department: str | None = Field(None, max_length=200)
    studentId: str | None = Field(None, max_length=50)
    orcid: str | None = Field(None, max_length=50)
    researchArea: str | None = Field(None, max_length=500)


class ChangePasswordRequest(BaseModel):
    oldPassword: str
    newPassword: str = Field(..., min_length=6, max_length=100)


class UserInfoResponse(BaseModel):
    userId: str
    username: str
    nickname: str
    email: str
    role: UserRole
    authStatus: int
    avatar: str | None = None
    realName: str | None = None
    institution: str | None = None
    department: str | None = None
    studentId: str | None = None
    orcid: str | None = None
    researchArea: str | None = None

    model_config = {"from_attributes": True}
