"""JWT token management and password hashing, compatible with Java backend."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from jose import JWTError, jwt

from app.platform.config import settings


def _get_secret_key() -> str:
    """Decode the JWT secret. Java uses Base64-encoded secrets."""
    raw = settings.JWT_SECRET
    if not raw:
        raise ValueError("JWT_SECRET must be set")
    try:
        decoded = base64.b64decode(raw)
        return decoded.decode("utf-8")
    except Exception:
        return raw


def create_access_token(
    username: str, user_id: str, role: str
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=settings.JWT_EXPIRATION_HOURS)
    payload = {
        "sub": username,
        "userId": user_id,
        "role": role,
        "iat": now,
        "exp": expire,
    }
    return jwt.encode(payload, _get_secret_key(), algorithm=settings.JWT_ALGORITHM)


def verify_token(token: str) -> dict | None:
    """Returns decoded claims or None if invalid."""
    try:
        payload = jwt.decode(
            token, _get_secret_key(), algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError:
        return None


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify password. Handles Java's $2a$ prefix (bcrypt compat)."""
    if hashed.startswith("$2a$"):
        hashed = "$2b$" + hashed[4:]
    return _bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
