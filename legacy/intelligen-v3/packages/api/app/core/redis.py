"""Redis client for API Gateway — sync support."""

import logging

import redis

logger = logging.getLogger(__name__)

_redis_client = None


def get_redis() -> redis.Redis:
    """Get or create Redis client."""
    global _redis_client
    if _redis_client is None:
        from app.platform.config import settings
        _redis_client = redis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_timeout=5,
            retry_on_timeout=True,
        )
    return _redis_client


def close_redis():
    """Close Redis connection."""
    global _redis_client
    if _redis_client:
        _redis_client.close()
        _redis_client = None


def redis_available() -> bool:
    """Check if Redis is reachable."""
    try:
        client = get_redis()
        return client.ping()
    except Exception:
        return False
