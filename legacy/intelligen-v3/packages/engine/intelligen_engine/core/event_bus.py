"""任务事件总线 — 支持 SSE 流式推送生成内容"""

import asyncio
import logging
from typing import AsyncIterator, Dict, List

logger = logging.getLogger(__name__)


class EventBus:
    """进程内异步事件总线，用于 SSE 内容流式推送。

    每个 task_id 可以有多个订阅者（多个 SSE 连接），
    发布时所有订阅者的 Queue 都会收到事件。
    """

    def __init__(self) -> None:
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}

    async def publish(self, task_id: str, event: dict) -> None:
        """发布事件到指定任务的所有订阅者"""
        queues = self._subscribers.get(task_id, [])
        for queue in queues:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # 队列满时丢弃旧事件，放入新事件
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    pass

    def publish_sync(self, task_id: str, event: dict) -> None:
        """从同步线程发布事件（线程安全）"""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.publish(task_id, event), loop
                )
            else:
                loop.run_until_complete(self.publish(task_id, event))
        except RuntimeError:
            logger.debug("EventBus: no running loop, event dropped for task %s", task_id)

    async def subscribe(self, task_id: str) -> AsyncIterator[dict]:
        """订阅指定任务的事件流"""
        queue: asyncio.Queue = asyncio.Queue(maxsize=256)
        self._subscribers.setdefault(task_id, []).append(queue)
        try:
            while True:
                event = await queue.get()
                yield event
                if event.get("type") in ("complete", "error"):
                    break
        finally:
            subs = self._subscribers.get(task_id, [])
            if queue in subs:
                subs.remove(queue)
            if not subs:
                self._subscribers.pop(task_id, None)

    def cleanup(self, task_id: str) -> None:
        """清理指定任务的所有订阅者"""
        removed = self._subscribers.pop(task_id, None)
        if removed:
            logger.debug("EventBus: cleaned up %d subscriber(s) for task %s", len(removed), task_id)


# 全局单例
event_bus = EventBus()
