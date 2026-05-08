"""异步Redis客户端 — 任务队列、SSE发布/订阅、LLM限流"""

from __future__ import annotations

import json
import logging
import time
from typing import AsyncIterator, Optional

import redis.asyncio as aioredis

from intelligen_engine.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: Optional[aioredis.Redis] = None

_TASK_QUEUE = "engine:task_queue"
_TASK_STATUS = "engine:task:{task_id}:status"
_TASK_DATA = "engine:task:{task_id}:data"
_PROGRESS_CHANNEL = "engine:progress:{task_id}"
_RPM_KEY = "engine:rpm:{model}"


async def init_redis() -> aioredis.Redis:
    """初始化全局Redis连接"""
    global _redis_client
    _redis_client = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
    )
    await _redis_client.ping()
    logger.info("Redis connection established")
    return _redis_client


async def close_redis():
    """关闭全局Redis连接"""
    global _redis_client
    if _redis_client is not None:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis connection closed")


def get_redis() -> aioredis.Redis:
    """获取全局Redis客户端，未初始化时抛异常"""
    if _redis_client is None:
        raise RuntimeError("Redis not initialized — call init_redis() first")
    return _redis_client


# ─── 任务队列操作 ─────────────────────────────────────────

async def enqueue_task(task_id: str, task_data: dict):
    """将任务推入Redis队列并存储数据"""
    r = get_redis()
    await r.set(
        _TASK_DATA.format(task_id=task_id),
        json.dumps(task_data, ensure_ascii=False),
        ex=86400 * 7,  # 7天TTL
    )
    await r.lpush(_TASK_QUEUE, task_id)
    await update_task_status(task_id, "pending")
    logger.info(f"Task {task_id} enqueued")


async def dequeue_task() -> Optional[str]:
    """从队列中弹出下一个task_id（非阻塞）"""
    r = get_redis()
    result = await r.rpop(_TASK_QUEUE)
    return result


async def get_task_data(task_id: str) -> Optional[dict]:
    """获取已存储的任务数据"""
    r = get_redis()
    raw = await r.get(_TASK_DATA.format(task_id=task_id))
    if raw is None:
        return None
    return json.loads(raw)


async def update_task_status(
    task_id: str,
    status: str,
    progress: float = 0.0,
    current_stage: str = "",
    result_url: str = "",
    error: str = "",
    extra: dict | None = None,
):
    """更新Redis中的任务状态"""
    r = get_redis()
    data = {
        "task_id": task_id,
        "status": status,
        "progress_pct": progress,
        "current_stage": current_stage,
        "result_url": result_url,
        "error": error,
    }
    if extra:
        data.update(extra)
    key = _TASK_STATUS.format(task_id=task_id)
    await r.set(key, json.dumps(data, ensure_ascii=False), ex=86400 * 7)


async def get_task_status(task_id: str) -> Optional[dict]:
    """从Redis读取当前任务状态"""
    r = get_redis()
    raw = await r.get(_TASK_STATUS.format(task_id=task_id))
    if raw is None:
        return None
    return json.loads(raw)


# ─── SSE 发布/订阅 ──────────────────────────────────────────

async def publish_progress(task_id: str, event_data: dict):
    """发布任务进度事件"""
    r = get_redis()
    channel = _PROGRESS_CHANNEL.format(task_id=task_id)
    await r.publish(channel, json.dumps(event_data, ensure_ascii=False))


async def subscribe_progress(task_id: str) -> AsyncIterator[dict]:
    """通过Redis pub/sub订阅任务进度事件"""
    r = get_redis()
    pubsub = r.pubsub()
    channel = _PROGRESS_CHANNEL.format(task_id=task_id)
    await pubsub.subscribe(channel)
    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    yield json.loads(message["data"])
                except (json.JSONDecodeError, TypeError):
                    continue
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()


# ─── LLM限流（滑动窗口） ────────────────────────────────────

async def check_rpm_limit(model: str, max_rpm: int = 60) -> bool:
    """检查模型是否在RPM预算内，返回True表示可用"""
    r = get_redis()
    key = _RPM_KEY.format(model=model)
    now = time.time()
    window_start = now - 60

    # 清除过期记录
    await r.zremrangebyscore(key, "-inf", window_start)
    count = await r.zcard(key)
    return count < max_rpm


async def increment_rpm(model: str):
    """记录一次请求用于限流统计"""
    r = get_redis()
    key = _RPM_KEY.format(model=model)
    now = time.time()
    await r.zadd(key, {f"{now}": now})
    await r.expire(key, 120)  # 自动清理
