"""LLM连接池 — 多密钥轮询与限流管理

使用Redis有序集合做滑动窗口RPM/TPM统计，
支持轮询选key、健康检查与自动恢复。
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from intelligen_engine.core.config import settings
from intelligen_engine.core.redis import get_redis

logger = logging.getLogger(__name__)

_RPM_PREFIX = "llm:rpm:"
_TPM_PREFIX = "llm:tpm:"

# 默认限流值（可通过EngineSettings覆盖）
_DEFAULT_RPM_LIMIT = 60
_DEFAULT_TPM_LIMIT = 100_000

# 健康恢复间隔（秒）
_HEALTH_RECOVERY_INTERVAL = 120


def _key_hash(api_key: str) -> str:
    """API密钥的SHA-256短哈希，用作Redis键"""
    return hashlib.sha256(api_key.encode()).hexdigest()[:16]


@dataclass
class LLMKeyInfo:
    """单个API密钥的状态跟踪"""

    key: str
    rpm_used: int = 0
    tpm_used: int = 0
    is_healthy: bool = True
    last_error: Optional[str] = None
    last_used: float = 0.0
    error_count: int = 0
    _hash: str = field(default="", repr=False)

    def __post_init__(self):
        self._hash = _key_hash(self.key)

    @property
    def key_hash(self) -> str:
        return self._hash

    @property
    def masked_key(self) -> str:
        """返回脱敏密钥，用于日志展示"""
        if len(self.key) <= 8:
            return "****"
        return f"{self.key[:4]}...{self.key[-4:]}"


class LLMPool:
    """LLM连接池 — 多密钥轮询与限流管理

    使用Redis有序集合做滑动窗口RPM/TPM统计，
    支持轮询选key、健康检查与自动恢复。
    """

    def __init__(self):
        self.keys: list[LLMKeyInfo] = []
        self._current_index = 0
        self._lock = asyncio.Lock()
        self._rpm_limit = getattr(settings, "LLM_RPM_LIMIT", _DEFAULT_RPM_LIMIT)
        self._tpm_limit = getattr(settings, "LLM_TPM_LIMIT", _DEFAULT_TPM_LIMIT)
        self._initialized = False

    async def initialize(self):
        """从配置加载API密钥"""
        key_list = settings.api_keys
        if not key_list:
            logger.warning("No LLM API keys configured — pool will be empty")
            self._initialized = True
            return

        self.keys = [LLMKeyInfo(key=k) for k in key_list]
        self._initialized = True
        logger.info(
            "LLM pool initialized with %d key(s): %s",
            len(self.keys),
            ", ".join(k.masked_key for k in self.keys),
        )

    async def _get_rpm_count(self, key_info: LLMKeyInfo) -> int:
        """通过Redis滑动窗口获取密钥当前RPM计数"""
        r = get_redis()
        rpm_key = f"{_RPM_PREFIX}{key_info.key_hash}"
        now = time.time()
        window_start = now - 60

        await r.zremrangebyscore(rpm_key, "-inf", window_start)
        count = await r.zcard(rpm_key)
        return count

    async def _get_tpm_count(self, key_info: LLMKeyInfo) -> int:
        """获取密钥当前TPM（每分钟Token数）计数"""
        r = get_redis()
        tpm_key = f"{_TPM_PREFIX}{key_info.key_hash}"
        now = time.time()
        window_start = now - 60

        await r.zremrangebyscore(tpm_key, "-inf", window_start)
        # 累加成员值（成员名存储Token计数）
        members = await r.zrange(tpm_key, 0, -1)
        total = 0
        for m in members:
            try:
                # 成员格式: "{timestamp}:{tokens}"
                total += int(str(m).split(":")[-1])
            except (ValueError, IndexError):
                pass
        return total

    async def acquire_key(self, model: str = "") -> str:
        """获取下一个可用的API密钥（轮询+限流检查）

        Raises:
            RuntimeError: 无可用密钥时抛出
        """
        if not self.keys:
            # 回退到单个 OPENROUTER_API_KEY
            if settings.OPENROUTER_API_KEY:
                return settings.OPENROUTER_API_KEY
            raise RuntimeError("No LLM API keys configured")

        async with self._lock:
            n = len(self.keys)
            best_key: Optional[LLMKeyInfo] = None
            best_rpm = float("inf")

            for i in range(n):
                idx = (self._current_index + i) % n
                key_info = self.keys[idx]

                if not key_info.is_healthy:
                    # 检查是否过了恢复间隔
                    if time.time() - key_info.last_used < _HEALTH_RECOVERY_INTERVAL:
                        continue
                    # 尝试恢复
                    key_info.is_healthy = True
                    key_info.error_count = 0
                    logger.info("Key %s recovered, re-enabling", key_info.masked_key)

                rpm = await self._get_rpm_count(key_info)
                key_info.rpm_used = rpm

                if rpm >= self._rpm_limit:
                    continue

                tpm = await self._get_tpm_count(key_info)
                key_info.tpm_used = tpm
                if tpm >= self._tpm_limit:
                    continue

                # 选RPM用量最低的密钥
                if rpm < best_rpm:
                    best_rpm = rpm
                    best_key = key_info

            if best_key is None:
                # 所有密钥均达限流上限
                logger.warning("All %d LLM keys at rate limit", n)
                raise RuntimeError(
                    "All LLM API keys are at their rate limit. "
                    "Please wait a moment and try again."
                )

            self._current_index = (self.keys.index(best_key) + 1) % n
            best_key.last_used = time.time()
            return best_key.key

    async def record_usage(self, key: str, tokens: int):
        """在Redis滑动窗口中记录一次请求和Token用量"""
        r = get_redis()
        kh = _key_hash(key)
        now = time.time()

        # RPM：每次请求一条记录
        rpm_key = f"{_RPM_PREFIX}{kh}"
        await r.zadd(rpm_key, {str(now): now})
        await r.expire(rpm_key, 120)

        # TPM：每次请求一条记录，成员名含Token数
        if tokens > 0:
            tpm_key = f"{_TPM_PREFIX}{kh}"
            member = f"{now}:{tokens}"
            await r.zadd(tpm_key, {member: now})
            await r.expire(tpm_key, 120)

        # 更新内存中的统计
        for ki in self.keys:
            if ki.key == key:
                ki.rpm_used += 1
                ki.tpm_used += tokens
                break

    async def mark_unhealthy(self, key: str, error: str):
        """出错后将密钥标记为不健康"""
        for ki in self.keys:
            if ki.key == key:
                ki.error_count += 1
                ki.last_error = error
                ki.last_used = time.time()
                # 连续3次错误后标记为不健康
                if ki.error_count >= 3:
                    ki.is_healthy = False
                    logger.warning(
                        "Key %s marked unhealthy after %d errors: %s",
                        ki.masked_key,
                        ki.error_count,
                        error,
                    )
                break

    async def mark_healthy(self, key: str):
        """成功调用后将密钥标记为健康"""
        for ki in self.keys:
            if ki.key == key:
                ki.error_count = 0
                ki.last_error = None
                if not ki.is_healthy:
                    ki.is_healthy = True
                    logger.info("Key %s restored to healthy", ki.masked_key)
                break

    async def health_check(self):
        """定期健康检查 — 恢复不健康时间足够长的密钥"""
        now = time.time()
        for ki in self.keys:
            if not ki.is_healthy and (now - ki.last_used) > _HEALTH_RECOVERY_INTERVAL:
                ki.is_healthy = True
                ki.error_count = 0
                logger.info("Key %s auto-recovered during health check", ki.masked_key)

    async def get_pool_status(self) -> dict:
        """返回连接池状态，供管理面板使用"""
        key_statuses = []
        for ki in self.keys:
            rpm = await self._get_rpm_count(ki)
            tpm = await self._get_tpm_count(ki)
            key_statuses.append(
                {
                    "key_hash": ki.key_hash,
                    "masked_key": ki.masked_key,
                    "is_healthy": ki.is_healthy,
                    "rpm_used": rpm,
                    "rpm_limit": self._rpm_limit,
                    "tpm_used": tpm,
                    "tpm_limit": self._tpm_limit,
                    "last_error": ki.last_error,
                    "error_count": ki.error_count,
                    "last_used": ki.last_used,
                }
            )
        return {
            "total_keys": len(self.keys),
            "healthy_keys": sum(1 for k in self.keys if k.is_healthy),
            "rpm_limit_per_key": self._rpm_limit,
            "tpm_limit_per_key": self._tpm_limit,
            "keys": key_statuses,
        }


# ── 全局单例 ──────────────────────────────────────────────

_pool: Optional[LLMPool] = None


async def init_llm_pool() -> LLMPool:
    """初始化全局LLM连接池单例"""
    global _pool
    _pool = LLMPool()
    await _pool.initialize()
    return _pool


def get_llm_pool() -> LLMPool:
    """获取全局LLM连接池，未初始化时抛异常"""
    if _pool is None:
        raise RuntimeError("LLM pool not initialized — call init_llm_pool() first")
    return _pool
