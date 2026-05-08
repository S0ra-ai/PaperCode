"""User-level and IP-level rate limiting middleware.

Uses Redis sliding window (sorted sets) for accurate per-window counting.
Applies different limits based on endpoint category.
"""

from __future__ import annotations

import logging
import time
from typing import Optional

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

logger = logging.getLogger(__name__)

# ── Endpoint categories and their limits ───────────────────

# (max_requests, window_seconds)
_RATE_LIMITS = {
    "generation": (10, 3600),      # 10 tasks/hour per user
    "upload": (30, 3600),          # 30 uploads/hour per user
    "clarify": (120, 3600),        # 120 clarification Q&A/hour per user
    "api_default": (100, 60),      # 100 requests/minute per IP
    "admin": (200, 60),            # 200 requests/minute for admin endpoints
}

# No limits applied to these paths
_EXEMPT_PREFIXES = ("/api/health", "/health", "/swagger-ui", "/v3/api-docs", "/openapi")

# Path prefix → category mapping
_CATEGORY_RULES: list[tuple[str, str, str]] = [
    # (path_prefix, http_method_or_"*", category)
    ("/clarify/", "*", "clarify"),             # clarification Q&A — higher limit
    ("/sessions/", "POST", "generation"),      # task creation
    ("/files/upload", "POST", "upload"),
    ("/admin/", "*", "admin"),
]


def _classify_endpoint(path: str, method: str) -> Optional[str]:
    """Return the rate-limit category for an endpoint, or None if exempt."""
    for prefix in _EXEMPT_PREFIXES:
        if path.startswith(prefix):
            return None

    for rule_prefix, rule_method, category in _CATEGORY_RULES:
        if path.startswith(rule_prefix) or rule_prefix in path:
            if rule_method == "*" or method.upper() == rule_method:
                return category

    return "api_default"


def _get_redis():
    """Get the sync Redis client from the API core module."""
    from app.core.redis import get_redis, redis_available
    if not redis_available():
        return None
    return get_redis()


def _check_rate_limit(redis_client, key: str, max_requests: int, window: int) -> tuple[bool, int, int]:
    """Check sliding-window rate limit. Returns (allowed, remaining, retry_after)."""
    now = time.time()
    window_start = now - window

    pipe = redis_client.pipeline()
    pipe.zremrangebyscore(key, "-inf", window_start)
    pipe.zcard(key)
    pipe.zadd(key, {str(now): now})
    pipe.expire(key, window + 10)
    results = pipe.execute()

    current_count = results[1]  # ZCARD result (before current request ZADD)

    if current_count >= max_requests:
        # Over limit — remove the entry we just added
        redis_client.zrem(key, str(now))
        # Calculate retry-after: time until oldest entry expires
        oldest = redis_client.zrange(key, 0, 0, withscores=True)
        retry_after = 1
        if oldest:
            oldest_time = oldest[0][1]
            retry_after = max(1, int(oldest_time + window - now))
        remaining = 0
        return False, remaining, retry_after

    remaining = max(0, max_requests - current_count - 1)
    return True, remaining, 0


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware with user-level and IP-level enforcement."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint):
        path = request.url.path
        method = request.method.upper()

        # Skip exempt paths and non-rate-limited methods
        if method in ("OPTIONS", "HEAD"):
            return await call_next(request)

        category = _classify_endpoint(path, method)
        if category is None:
            return await call_next(request)

        r = _get_redis()
        if r is None:
            # Redis unavailable — fail open (allow request)
            return await call_next(request)

        max_requests, window = _RATE_LIMITS.get(category, (100, 60))
        client_ip = request.client.host if request.client else "unknown"

        # Extract user_id from JWT if available (non-blocking best-effort)
        user_id = self._extract_user_id(request)

        # IP-level rate limit
        ip_key = f"ratelimit:ip:{client_ip}:{category}"
        ip_allowed, ip_remaining, ip_retry = _check_rate_limit(
            r, ip_key, max_requests, window
        )
        if not ip_allowed:
            logger.warning(
                "IP rate limit exceeded: ip=%s category=%s path=%s",
                client_ip, category, path,
            )
            return self._rate_limit_response(ip_retry, window, max_requests)

        # User-level rate limit (stricter for generation/upload)
        if user_id and category in ("generation", "upload"):
            user_key = f"ratelimit:user:{user_id}:{category}"
            user_allowed, user_remaining, user_retry = _check_rate_limit(
                r, user_key, max_requests, window
            )
            if not user_allowed:
                logger.warning(
                    "User rate limit exceeded: user=%s category=%s path=%s",
                    user_id, category, path,
                )
                return self._rate_limit_response(user_retry, window, max_requests)

        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(max_requests)
        response.headers["X-RateLimit-Remaining"] = str(ip_remaining)
        response.headers["X-RateLimit-Reset"] = str(int(time.time()) + window)

        return response

    @staticmethod
    def _extract_user_id(request: Request) -> Optional[str]:
        """Best-effort extraction of user_id from JWT cookie/header."""
        try:
            token = request.cookies.get("access_token")
            if not token:
                auth_header = request.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header[7:]
            if not token:
                return None
            from app.platform.security import verify_token
            claims = verify_token(token)
            if claims:
                return claims.get("userId")
        except Exception:
            pass
        return None

    @staticmethod
    def _rate_limit_response(retry_after: int, window: int, limit: int) -> JSONResponse:
        """Return a 429 response with Retry-After header."""
        return JSONResponse(
            status_code=429,
            content={
                "code": 429,
                "message": f"请求频率超限，请在 {retry_after} 秒后重试",
                "data": None,
            },
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(limit),
                "X-RateLimit-Remaining": "0",
                "X-RateLimit-Reset": str(int(time.time()) + window),
            },
        )
