"""认证与用户身份模块"""

from app.modules.auth.api import router
from app.modules.auth.deps import CurrentUser, get_current_user, require_admin, require_approved
from app.modules.auth.enums import UserRole
from app.modules.auth.models import User

__all__ = [
    "CurrentUser",
    "User",
    "UserRole",
    "get_current_user",
    "require_admin",
    "require_approved",
    "router",
]
