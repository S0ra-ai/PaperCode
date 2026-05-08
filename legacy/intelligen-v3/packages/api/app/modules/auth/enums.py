"""应用共享枚举定义"""

from __future__ import annotations

from enum import Enum


class UserRole(str, Enum):
    """用户角色 — 值为小写，与数据库和JWT保持一致"""

    ADMIN = "admin"
    STUDENT = "student"
    TEACHER = "teacher"
    USER = "user"
