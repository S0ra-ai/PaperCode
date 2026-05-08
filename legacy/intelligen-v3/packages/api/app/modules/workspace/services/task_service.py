"""Task service — generation orchestration, progress, checkpoints."""

from __future__ import annotations

import logging
import os
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal
from queue import Empty, Full, Queue
from threading import Event, Lock
from typing import Callable

from sqlalchemy import desc
from sqlalchemy.orm import Session as DBSession, joinedload

from app.platform.exceptions import BusinessException, NotFoundException
from app.platform.database import SessionLocal
from app.platform.config import settings
from app.modules.workspace.models.file import StoredFile
from app.modules.workspace.models.session import Session
from app.modules.workspace.models.task import GenerateTask, GenerateTaskFile
from app.modules.workspace.schemas.task import CreateTaskRequest, TaskProgressEventResponse


logger = logging.getLogger(__name__)

# Recognised task statuses
VALID_TASK_STATUSES = frozenset({
    "pending", "processing", "running",
    "completed", "failed",
    "cancelled", "retrying",
})

TERMINAL_TASK_STATUSES = frozenset({
    "completed", "success", "succeeded",
    "failed", "error",
    "cancelled",
})


def _map_engine_status(status: str) -> str:
    if status in {"completed", "success", "succeeded"}:
        return "completed"
    if status in {"failed", "error"}:
        return "failed"
    if status == "cancelled":
        return "cancelled"
    return "processing"


class TaskProgressBroker:
    """In-process pub/sub broker for task progress updates."""

    def __init__(self, max_queue_size: int = 32) -> None:
        self._max_queue_size = max_queue_size
        self._lock = Lock()
        self._subscribers: dict[str, set[Queue]] = {}

    def subscribe(self, task_id: str) -> Queue:
        subscriber: Queue = Queue(maxsize=self._max_queue_size)
        with self._lock:
            self._subscribers.setdefault(task_id, set()).add(subscriber)
        return subscriber

    def unsubscribe(self, task_id: str, subscriber: Queue) -> None:
        with self._lock:
            subscribers = self._subscribers.get(task_id)
            if not subscribers:
                return
            subscribers.discard(subscriber)
            if not subscribers:
                self._subscribers.pop(task_id, None)

    def cleanup(self, task_id: str) -> None:
        """Remove all subscribers for a task (call after terminal state)."""
        with self._lock:
            subscribers = self._subscribers.pop(task_id, None)
        if subscribers:
            logger.debug("Cleaned up %d SSE subscriber(s) for task %s", len(subscribers), task_id)

    def publish(self, task_id: str, event: dict) -> None:
        with self._lock:
            subscribers = tuple(self._subscribers.get(task_id, ()))

        for subscriber in subscribers:
            try:
                subscriber.put_nowait(dict(event))
            except Full:
                try:
                    subscriber.get_nowait()
                except Empty:
                    pass
                try:
                    subscriber.put_nowait(dict(event))
                except Full:
                    logger.debug("Dropped saturated task progress event for task %s", task_id)


class TaskRuntimeController:
    """Minimal in-process executor for generation tasks."""

    def __init__(self, max_workers: int | None = None, broker: TaskProgressBroker | None = None) -> None:
        self._max_workers = max(1, max_workers or self._read_max_workers())
        self._executor = ThreadPoolExecutor(
            max_workers=self._max_workers,
            thread_name_prefix="task-runtime",
        )
        self._lock = Lock()
        self._queued_task_ids: set[str] = set()
        self._running_task_ids: set[str] = set()
        self._futures: dict[str, Future] = {}
        self._cancel_events: dict[str, Event] = {}
        self._broker = broker

    @staticmethod
    def _read_max_workers() -> int:
        raw_value = os.getenv("TASK_RUNTIME_MAX_WORKERS", "2")
        try:
            return int(raw_value)
        except (TypeError, ValueError):
            return 2

    @property
    def max_workers(self) -> int:
        return self._max_workers

    def submit(
        self,
        task_id: str,
        job: Callable[..., object],
        *args,
        **kwargs,
    ) -> Future:
        with self._lock:
            existing = self._futures.get(task_id)
            if existing and not existing.done():
                raise BusinessException(409, "任务已在执行队列中")

            cancel_event = Event()
            self._cancel_events[task_id] = cancel_event

            future = self._executor.submit(
                self._run_job,
                task_id,
                job,
                args,
                kwargs,
            )
            self._futures[task_id] = future
            self._queued_task_ids.add(task_id)
            future.add_done_callback(
                lambda done_future, current_task_id=task_id: self._finalize(current_task_id, done_future)
            )
            return future

    def _run_job(
        self,
        task_id: str,
        job: Callable[..., object],
        args: tuple,
        kwargs: dict,
    ) -> object:
        with self._lock:
            self._queued_task_ids.discard(task_id)
            self._running_task_ids.add(task_id)
        return job(*args, **kwargs)

    def _finalize(self, task_id: str, future: Future) -> None:
        with self._lock:
            self._queued_task_ids.discard(task_id)
            self._running_task_ids.discard(task_id)
            if self._futures.get(task_id) is future:
                self._futures.pop(task_id, None)
            self._cancel_events.pop(task_id, None)

        # Clean up SSE subscribers to prevent memory leaks
        if self._broker is not None:
            self._broker.cleanup(task_id)

    def is_running(self, task_id: str) -> bool:
        with self._lock:
            return task_id in self._running_task_ids

    def running_task_ids(self) -> set[str]:
        with self._lock:
            return set(self._running_task_ids)

    def get_cancel_event(self, task_id: str) -> Event | None:
        with self._lock:
            return self._cancel_events.get(task_id)

    def request_cancel(self, task_id: str) -> bool:
        """Signal a running task to stop. Returns True if signal was set."""
        with self._lock:
            event = self._cancel_events.get(task_id)
            if event is None:
                return False
            event.set()
            return True


class TaskService:
    progress_broker = TaskProgressBroker()
    runtime = TaskRuntimeController(broker=progress_broker)
    _engine_sync_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="engine-sync")
    # In-memory transient stage metadata (survives SSE reconnects / polling fallback)
    _stage_meta: dict[str, dict] = {}

    # ------------------------------------------------------------------
    # Background generation helpers (run in their own DB session)
    # ------------------------------------------------------------------

    @staticmethod
    def is_terminal_status(status: str | None) -> bool:
        return str(status or "").lower() in TERMINAL_TASK_STATUSES

    @staticmethod
    def _classify_error_message(error_message: str | None) -> str | None:
        if not error_message:
            return None
        from app.modules.generation.regeneration.generation_bridge import classify_generation_error

        return classify_generation_error(
            error_message,
            default_message=error_message,
        ).category

    @classmethod
    def build_progress_event(
        cls,
        task: GenerateTask,
        *,
        error_category: str | None = None,
    ) -> dict:
        meta = cls._stage_meta.get(task.taskId, {})
        payload = TaskProgressEventResponse(
            taskId=task.taskId,
            sessionId=task.sessionId,
            status=task.status,
            userInput=task.userInput,
            outline=task.outline,
            templateFileId=task.templateFileId,
            templateFileName=task.templateFileName,
            templateFileType=task.templateFileType,
            progress=float(task.progress) if task.progress is not None else None,
            currentSection=task.currentSection,
            totalSections=task.totalSections,
            resultFileId=task.resultFileId,
            resultFileName=task.resultFileName,
            resultFileType=task.resultFileType,
            errorMessage=task.errorMessage,
            errorCategory=error_category or cls._classify_error_message(task.errorMessage),
            retryCount=task.retryCount,
            maxRetries=task.maxRetries,
            createdAt=task.createdAt,
            updatedAt=task.updatedAt,
            completedAt=task.completedAt,
            stage=meta.get("stage"),
            stageName=meta.get("stageName"),
            currentSectionTitle=meta.get("currentSectionTitle"),
            estimatedSecondsLeft=meta.get("estimatedSecondsLeft"),
        )
        data = payload.model_dump(mode="json")
        if meta.get("artifactPaths"):
            data["artifactPaths"] = meta["artifactPaths"]
        if meta.get("executionMode"):
            data["executionMode"] = meta["executionMode"]
        return data

    @classmethod
    def publish_task_event(
        cls,
        task: GenerateTask,
        *,
        error_category: str | None = None,
    ) -> dict:
        event = cls.build_progress_event(task, error_category=error_category)
        cls.progress_broker.publish(task.taskId, event)
        return event

    @classmethod
    def subscribe_task_progress(cls, task_id: str) -> Queue:
        return cls.progress_broker.subscribe(task_id)

    @classmethod
    def unsubscribe_task_progress(cls, task_id: str, subscriber: Queue) -> None:
        cls.progress_broker.unsubscribe(task_id, subscriber)

    @staticmethod
    def _run_generation(
        task_id: str,
        user_input: str,
        outline: str | None,
        template_content: str | None,
        user_file_paths: list[str],
        requirement: str | None = None,
        citation_style: str = "gb",
        target_word_count: int | None = None,
        generation_mode: str = "legacy_report",
    ) -> None:
        """Background thread that calls the generation pipeline."""
        db = SessionLocal()
        try:
            if generation_mode != "legacy_report":
                raise RuntimeError("论文模式需要独立 Engine 服务，不能回退到旧 Markdown 生成流程。")

            task = db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
            if not task:
                return

            task.status = "processing"
            task.errorMessage = None
            db.commit()
            db.refresh(task)
            TaskService.publish_task_event(task)

            from app.modules.generation.regeneration.generation_bridge import run_report_generation

            import time as _time
            gen_start_time = _time.time()

            def progress_cb(current_section: int, total_sections: int, **kwargs):
                TaskService._update_progress(
                    db, task_id, current_section, total_sections,
                    start_time=gen_start_time, **kwargs,
                )

            def checkpoint_cb(section_index: int, title: str, content: str,
                              summary: str, tokens: int):
                TaskService._save_checkpoint(db, task_id, section_index, title, content, summary, tokens)

            def content_cb(section_index: int, section_title: str,
                           content: str, total_sections: int):
                """Push content event for real-time preview via SSE."""
                paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
                TaskService.progress_broker.publish(task_id, {
                    "type": "content",
                    "taskId": task_id,
                    "sectionIndex": section_index,
                    "sectionTitle": section_title,
                    "paragraphs": paragraphs,
                    "totalSections": total_sections,
                })

            existing_checkpoints = TaskService._load_checkpoints(db, task_id)

            # 总超时: 防止生成任务永远挂起
            import concurrent.futures
            gen_timeout = getattr(settings, "GENERATION_TIMEOUT_SECONDS", 1800)
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as _pool:
                _future = _pool.submit(
                    run_report_generation,
                    task_id=task_id,
                    user_input=user_input,
                    outline=outline,
                    template_content=template_content,
                    user_file_paths=user_file_paths,
                    requirement=requirement,
                    citation_style=citation_style,
                    progress_callback=progress_cb,
                    checkpoint_callback=checkpoint_cb,
                    existing_checkpoints=existing_checkpoints if existing_checkpoints else None,
                    content_callback=content_cb,
                    target_word_count=target_word_count,
                )
                try:
                    result_markdown = _future.result(timeout=gen_timeout)
                except concurrent.futures.TimeoutError:
                    logger.error("Task %s exceeded generation timeout (%ds)", task_id, gen_timeout)
                    _future.cancel()
                    raise TimeoutError(
                        f"生成任务超过 {gen_timeout} 秒未完成，已自动中止。请检查 LLM 配置或减小生成范围。"
                    )

            task = db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
            if task:
                task.status = "completed"
                task.resultMarkdown = result_markdown
                task.progress = Decimal("100.00")
                task.completedAt = datetime.now(timezone.utc)
                db.commit()
                db.refresh(task)
                TaskService._stage_meta.pop(task_id, None)
                TaskService.publish_task_event(task)

        except Exception as e:
            logger.error("Task %s generation failed: %s", task_id, e, exc_info=True)
            from app.modules.generation.regeneration.generation_bridge import to_generation_error

            safe_error = to_generation_error(e)
            task = db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
            if task:
                task.status = "failed"
                task.errorMessage = safe_error.safe_message
                db.commit()
                db.refresh(task)
                TaskService._stage_meta.pop(task_id, None)
                TaskService.publish_task_event(task, error_category=safe_error.category)
        finally:
            db.close()

    @classmethod
    def _submit_generation_job(
        cls,
        task_id: str,
        user_input: str,
        outline: str | None,
        template_content: str | None,
        user_file_paths: list[str],
        requirement: str | None = None,
        citation_style: str = "gb",
        target_word_count: int | None = None,
        generation_mode: str = "legacy_report",
        venue_label: str | None = None,
        venue_variant: str | None = None,
        authors: list[str] | None = None,
        control_mode: str = "batch_autopilot",
        manual_citation_overrides: list[str] | None = None,
    ) -> str:
        """Try the remote Engine first; fall back to in-process generation."""
        execution_mode = cls._try_engine_submit(
            task_id, user_input, outline, template_content,
            user_file_paths, requirement, citation_style,
            target_word_count=target_word_count,
            generation_mode=generation_mode,
            venue_label=venue_label,
            venue_variant=venue_variant,
            authors=authors,
            control_mode=control_mode,
            manual_citation_overrides=manual_citation_overrides,
        )
        if execution_mode == "engine":
            logger.info("Task %s submitted to Engine service", task_id)
            cls._stage_meta.setdefault(task_id, {})["executionMode"] = "engine"
            cls._mark_engine_task_processing(task_id)
            cls._start_engine_sync(task_id)
            return "engine"

        # Fallback: in-process generation — notify user via SSE
        logger.warning("Task %s running in-process (Engine unavailable)", task_id)
        cls._stage_meta.setdefault(task_id, {})["executionMode"] = "in-process"
        try:
            cls.progress_broker.publish(task_id, {
                "type": "warning",
                "taskId": task_id,
                "message": "生成引擎暂不可用，已切换到内置模式（性能可能较慢）",
            })
        except Exception:
            pass
        cls.runtime.submit(
            task_id,
            cls._run_generation,
            task_id,
            user_input,
            outline,
            template_content,
            user_file_paths,
            requirement,
            citation_style,
            target_word_count,
            generation_mode,
        )
        return "in-process"

    @classmethod
    def _mark_engine_task_processing(cls, task_id: str) -> None:
        """Mirror successful Engine submission immediately in the API DB."""
        db = SessionLocal()
        try:
            task = db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
            if not task:
                return
            task.externalTaskId = task_id
            task.status = "processing"
            task.progress = Decimal("0.00")
            task.errorMessage = None
            db.commit()
            db.refresh(task)
            cls.publish_task_event(task)
        finally:
            db.close()

    @classmethod
    def _start_engine_sync(cls, task_id: str) -> None:
        future = cls._engine_sync_executor.submit(cls._sync_engine_task, task_id)

        def _log_failure(done_future: Future) -> None:
            exc = done_future.exception()
            if exc is not None:
                logger.warning("Engine sync worker failed for task %s: %s", task_id, exc)

        future.add_done_callback(_log_failure)

    @staticmethod
    def _apply_engine_status(task: GenerateTask, status: dict) -> None:
        engine_status = str(status.get("status") or "processing").lower()
        task.status = _map_engine_status(engine_status)
        task.progress = Decimal(str(status.get("progress_pct") or 0))
        if status.get("error"):
            task.errorMessage = str(status["error"])
        if status.get("result_markdown"):
            task.resultMarkdown = str(status["result_markdown"])
        if task.status == "completed" and task.completedAt is None:
            task.completedAt = datetime.now(timezone.utc)

        meta = TaskService._stage_meta.setdefault(task.taskId, {})
        meta["executionMode"] = "engine"
        if status.get("current_stage"):
            meta["stage"] = status["current_stage"]
            meta["stageName"] = status["current_stage"]
        if status.get("artifact_paths"):
            meta["artifactPaths"] = status["artifact_paths"]

    @staticmethod
    def refresh_engine_task_once(task: GenerateTask, db: DBSession) -> None:
        """Best-effort one-shot Engine sync for reads after missed background sync."""
        engine_task_id = task.externalTaskId or task.taskId
        if task.status in TERMINAL_TASK_STATUSES and task.taskId in TaskService._stage_meta:
            return
        if task.status in TERMINAL_TASK_STATUSES and not task.externalTaskId:
            return

        import httpx

        try:
            with httpx.Client(
                base_url=settings.ENGINE_BASE_URL,
                timeout=httpx.Timeout(10.0, connect=3.0),
                trust_env=False,
            ) as client:
                response = client.get(f"/engine/tasks/{engine_task_id}/status")
                if response.status_code == 404:
                    return
                response.raise_for_status()
                TaskService._apply_engine_status(task, response.json())
                db.commit()
                db.refresh(task)
        except Exception as exc:
            logger.debug("Best-effort Engine refresh skipped for task %s: %s", task.taskId, exc)

    @classmethod
    def _try_engine_submit(
        cls,
        task_id: str,
        user_input: str,
        outline: str | None,
        template_content: str | None,
        user_file_paths: list[str],
        requirement: str | None,
        citation_style: str,
        target_word_count: int | None = None,
        generation_mode: str = "legacy_report",
        venue_label: str | None = None,
        venue_variant: str | None = None,
        authors: list[str] | None = None,
        control_mode: str = "batch_autopilot",
        manual_citation_overrides: list[str] | None = None,
    ) -> str:
        """Attempt to submit task to Engine via EngineClient.

        Returns ``"engine"`` on success, ``"in-process"`` on failure.
        This runs a small asyncio call from the sync context.
        """
        try:
            import asyncio
            from app.core.engine_client import engine_client

            async def _submit():
                available = await engine_client.refresh_availability()
                if not available:
                    return "in-process"
                payload = {
                    "task_id": task_id,
                    "user_input": user_input,
                    "outline": outline,
                    "template_content": template_content,
                    "user_file_paths": user_file_paths,
                    "requirement": requirement,
                    "citation_style": citation_style,
                    "generation_mode": generation_mode,
                    "control_mode": control_mode,
                }
                if target_word_count is not None:
                    payload["target_word_count"] = target_word_count
                if venue_label:
                    payload["venue_label"] = venue_label
                if venue_variant:
                    payload["venue_variant"] = venue_variant
                if authors:
                    payload["authors"] = authors
                if manual_citation_overrides:
                    payload["manual_citation_overrides"] = manual_citation_overrides
                await engine_client.submit_task(payload)
                return "engine"

            # Use a fresh event loop if none is running in this thread
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop and loop.is_running():
                # We're inside an async context — schedule coroutine
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    return pool.submit(lambda: asyncio.run(_submit())).result(timeout=10)
            else:
                return asyncio.run(_submit())

        except Exception as exc:
            logger.warning("Engine submission failed for task %s: %s", task_id, exc)
            return "in-process"

    @staticmethod
    def _sync_engine_task(task_id: str) -> None:
        """Poll the standalone Engine and mirror status into API DB/SSE."""
        import time

        import httpx

        db = SessionLocal()
        try:
            with httpx.Client(
                base_url=settings.ENGINE_BASE_URL,
                timeout=httpx.Timeout(300.0, connect=10.0),
                trust_env=False,
            ) as client:
                for _ in range(720):
                    response = client.get(f"/engine/tasks/{task_id}/status")
                    response.raise_for_status()
                    status = response.json()
                    task = db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
                    if not task:
                        return

                    task.externalTaskId = task_id
                    TaskService._apply_engine_status(task, status)

                    db.commit()
                    db.refresh(task)
                    TaskService.publish_task_event(task)
                    if task.status in TERMINAL_TASK_STATUSES:
                        return
                    time.sleep(1)
        except Exception as exc:
            logger.warning("Failed to sync Engine task %s: %s", task_id, exc)
        finally:
            db.close()

    @staticmethod
    def _update_progress(db: DBSession, task_id: str, current_section: int,
                         total_sections: int, *, stage: str | None = None,
                         stage_name: str | None = None,
                         section_title: str | None = None,
                         start_time: float | None = None) -> None:
        task = db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
        if task and total_sections > 0:
            pct = round((current_section / total_sections) * 100, 2)
            task.progress = Decimal(str(pct))
            task.currentSection = current_section
            task.totalSections = total_sections
            db.commit()
            db.refresh(task)
            # Persist transient stage metadata in memory for polling fallback
            meta: dict = {}
            if stage:
                meta["stage"] = stage
            if stage_name:
                meta["stageName"] = stage_name
            if section_title:
                meta["currentSectionTitle"] = section_title
            if start_time:
                import time
                elapsed = time.time() - start_time
                if current_section > 0 and total_sections > current_section:
                    avg_per_section = elapsed / current_section
                    remaining = (total_sections - current_section) * avg_per_section
                    meta["estimatedSecondsLeft"] = int(remaining)
            if meta:
                TaskService._stage_meta[task_id] = meta
            event = TaskService.build_progress_event(task)
            TaskService.progress_broker.publish(task_id, event)

    @staticmethod
    def _save_checkpoint(db: DBSession, task_id: str, section_index: int,
                         title: str, content: str, summary: str, tokens: int) -> None:
        from app.modules.generation.models import SectionCheckpoint
        existing = (
            db.query(SectionCheckpoint)
            .filter(SectionCheckpoint.task_id == task_id,
                    SectionCheckpoint.section_index == section_index)
            .first()
        )
        if existing:
            existing.content = content
            existing.summary = summary
            existing.token_usage = tokens
        else:
            cp = SectionCheckpoint(
                task_id=task_id,
                section_index=section_index,
                section_title=title,
                content=content,
                summary=summary,
                token_usage=tokens,
            )
            db.add(cp)
        db.commit()

    @staticmethod
    def _load_checkpoints(db: DBSession, task_id: str) -> list[dict]:
        from app.modules.generation.models import SectionCheckpoint
        rows = (
            db.query(SectionCheckpoint)
            .filter(SectionCheckpoint.task_id == task_id)
            .order_by(SectionCheckpoint.section_index)
            .all()
        )
        return [
            {
                "section_index": r.section_index,
                "title": r.section_title,
                "content": r.content,
                "summary": r.summary or "",
            }
            for r in rows
        ]

    # ------------------------------------------------------------------
    # Template helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _resolve_template(stored_file: StoredFile | None) -> tuple[str | None, str | None, str | None]:
        """Return (template_content, file_name, file_type) for a template StoredFile."""
        if not stored_file:
            return None, None, None
        template_content = None
        if stored_file.filePath and os.path.exists(stored_file.filePath):
            try:
                with open(stored_file.filePath, "r", encoding="utf-8", errors="ignore") as f:
                    template_content = f.read()
            except Exception:
                pass
        return template_content, stored_file.fileName, stored_file.fileType

    @staticmethod
    def _collect_file_paths(task_files, user_id: str, db: DBSession) -> list[str]:
        """Collect local disk paths for task-attached files (uses filePath)."""
        paths: list[str] = []
        for tf in task_files:
            sf = (
                db.query(StoredFile)
                .filter(StoredFile.fileId == tf.fileId, StoredFile.userId == user_id)
                .first()
            )
            if sf and sf.filePath:
                paths.append(sf.filePath)
        return paths

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @staticmethod
    def create_task(
        session_id: str, user_id: str, req: CreateTaskRequest, db: DBSession,
    ) -> GenerateTask:
        task_id = str(uuid.uuid4())

        # Resolve template
        template_content, template_file_name, template_file_type = None, None, None
        if req.templateFileId:
            tpl = db.query(StoredFile).filter(
                StoredFile.fileId == req.templateFileId,
                StoredFile.userId == user_id,
            ).first()
            template_content, template_file_name, template_file_type = (
                TaskService._resolve_template(tpl)
            )

        task = GenerateTask(
            taskId=task_id,
            sessionId=session_id,
            status="pending",
            userInput=req.userInput,
            outline=req.outline,
            templateFileId=req.templateFileId,
            templateFileName=template_file_name,
            templateFileType=template_file_type,
            citationStyle=req.citationStyle,
        )
        db.add(task)

        # Attach files — collect local disk paths
        user_file_paths: list[str] = []
        for fid in req.fileIds:
            sf = db.query(StoredFile).filter(
                StoredFile.fileId == fid, StoredFile.userId == user_id
            ).first()
            if sf:
                tf = GenerateTaskFile(taskId=task_id, fileId=fid, fileNameSnapshot=sf.fileName)
                db.add(tf)
                if sf.filePath:
                    user_file_paths.append(sf.filePath)

        db.commit()
        db.refresh(task)
        TaskService.publish_task_event(task)

        # Auto-rename session from default "新对话" to user input
        from app.modules.workspace.services.session_service import SessionService
        SessionService.auto_title_from_task(session_id, req.userInput, db)

        execution_mode = TaskService._submit_generation_job(
            task_id,
            req.userInput,
            req.outline,
            template_content,
            user_file_paths,
            requirement=req.requirement,
            citation_style=req.citationStyle,
            target_word_count=req.targetWordCount,
            generation_mode=req.generationMode,
            venue_label=req.venueLabel,
            venue_variant=req.venueVariant,
            authors=req.authors,
            control_mode=req.controlMode,
            manual_citation_overrides=req.manualCitationOverrides,
        )
        if execution_mode == "engine":
            db.refresh(task)

        return task

    @staticmethod
    def retry_task(task_id: str, user_id: str, db: DBSession) -> GenerateTask:
        task = (
            db.query(GenerateTask)
            .options(joinedload(GenerateTask.task_files))
            .join(Session, GenerateTask.sessionId == Session.sessionId)
            .filter(GenerateTask.taskId == task_id, Session.userId == user_id)
            .first()
        )
        if not task:
            raise NotFoundException("任务不存在")
        if task.status not in ("failed", "completed", "cancelled"):
            raise BusinessException(400, "只有失败或已完成的任务可以重试")
        if task.retryCount >= task.maxRetries:
            raise BusinessException(400, "已达到最大重试次数")

        task.status = "retrying"
        task.retryCount += 1
        task.errorMessage = None
        task.progress = Decimal("0.00")
        task.currentSection = None
        task.totalSections = None
        task.completedAt = None
        db.commit()
        db.refresh(task)
        TaskService.publish_task_event(task)

        task.status = "pending"
        db.commit()
        db.refresh(task)
        TaskService.publish_task_event(task)

        file_paths = TaskService._collect_file_paths(task.task_files, user_id, db)

        template_content = None
        if task.templateFileId:
            tpl = db.query(StoredFile).filter(
                StoredFile.fileId == task.templateFileId,
                StoredFile.userId == user_id,
            ).first()
            template_content, _, _ = TaskService._resolve_template(tpl)

        TaskService._submit_generation_job(
            task_id,
            task.userInput,
            task.outline,
            template_content,
            file_paths,
            citation_style=task.citationStyle or "gb",
        )

        return task

    @staticmethod
    def cancel_task(task_id: str, user_id: str, db: DBSession) -> GenerateTask:
        task = (
            db.query(GenerateTask)
            .join(Session, GenerateTask.sessionId == Session.sessionId)
            .filter(GenerateTask.taskId == task_id, Session.userId == user_id)
            .first()
        )
        if not task:
            raise NotFoundException("任务不存在")
        if TaskService.is_terminal_status(task.status):
            raise BusinessException(400, "任务已处于终态，无法取消")

        TaskService.runtime.request_cancel(task_id)

        task.status = "cancelled"
        task.errorMessage = "用户取消"
        task.completedAt = datetime.now(timezone.utc)
        db.commit()
        db.refresh(task)
        TaskService._stage_meta.pop(task_id, None)
        TaskService.publish_task_event(task, error_category="cancelled")
        return task

    @staticmethod
    def get_task(task_id: str, user_id: str, db: DBSession) -> GenerateTask:
        task = (
            db.query(GenerateTask)
            .options(joinedload(GenerateTask.task_files))
            .join(Session, GenerateTask.sessionId == Session.sessionId)
            .filter(GenerateTask.taskId == task_id, Session.userId == user_id)
            .first()
        )
        if not task:
            raise NotFoundException("任务不存在")
        TaskService.refresh_engine_task_once(task, db)
        return task

    @staticmethod
    def list_tasks(session_id: str, db: DBSession) -> list[GenerateTask]:
        tasks = (
            db.query(GenerateTask)
            .options(joinedload(GenerateTask.task_files))
            .filter(GenerateTask.sessionId == session_id)
            .order_by(desc(GenerateTask.createdAt))
            .all()
        )
        for task in tasks:
            TaskService.refresh_engine_task_once(task, db)
        return tasks

    @staticmethod
    def list_user_tasks(
        user_id: str,
        db: DBSession,
        status: str | None = None,
        page: int = 1,
        per_page: int = 20,
    ) -> tuple[list[GenerateTask], int]:
        """列出当前用户所有任务，支持分页和状态过滤"""
        query = (
            db.query(GenerateTask)
            .options(joinedload(GenerateTask.task_files))
            .join(Session, GenerateTask.sessionId == Session.sessionId)
            .filter(Session.userId == user_id)
        )
        if status:
            statuses = [s.strip() for s in status.split(",") if s.strip()]
            if len(statuses) == 1:
                query = query.filter(GenerateTask.status == statuses[0])
            elif statuses:
                query = query.filter(GenerateTask.status.in_(statuses))

        total = query.count()
        tasks = (
            query.order_by(desc(GenerateTask.createdAt))
            .offset((page - 1) * per_page)
            .limit(per_page)
            .all()
        )
        for task in tasks:
            TaskService.refresh_engine_task_once(task, db)
        return tasks, total
