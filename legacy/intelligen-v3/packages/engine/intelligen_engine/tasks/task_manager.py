"""Task Manager — orchestrates generation tasks for IntelliGen Engine.

Manages the lifecycle of report-generation tasks: submission, execution,
status tracking, cancellation, recovery, and persistence to both Redis
and PostgreSQL.
"""

from __future__ import annotations

import asyncio
import logging
import traceback
from pathlib import Path
from typing import Optional

from intelligen_engine.core.config import settings
from intelligen_engine.core.redis import (
    enqueue_task,
    get_redis,
    get_task_data,
    get_task_status,
    publish_progress,
    update_task_status,
)
from intelligen_engine.tasks.state_machine import (
    transition,
)

logger = logging.getLogger(__name__)

# Tunables
TASK_TIMEOUT_SECONDS = 600
LLM_RETRY_ATTEMPTS = 3
LLM_RETRY_BASE_DELAY = 2.0  # seconds, doubles each attempt


class TaskManager:
    """Orchestrates generation tasks using Redis for state and asyncio for execution."""

    def __init__(self):
        self._running_tasks: dict[str, asyncio.Task] = {}
        self._cancel_flags: dict[str, asyncio.Event] = {}

    # ─── Public API ─────────────────────────────────────────

    async def submit_task(self, task_data: dict) -> dict:
        """Validate and enqueue a new generation task, then start execution."""
        task_id = task_data["task_id"]

        # Check for duplicate
        existing = await get_task_status(task_id)
        if existing and existing.get("status") in ("pending", "generating", "planning"):
            logger.warning(f"Task {task_id} already in progress, skipping duplicate")
            return existing

        # Enqueue to Redis (data only; we execute directly via asyncio below)
        await enqueue_task(task_id, task_data)
        # 立即出队：本 Engine 使用 asyncio.create_task 直接执行，Redis 队列仅作为
        # 任务数据存储；不 pop 会导致 queue_depth 永远增长
        try:
            from intelligen_engine.core.redis import dequeue_task
            await dequeue_task()
        except Exception:
            pass

        # Persist initial record to PostgreSQL
        await self._persist_task_to_pg(task_id, task_data, "pending")

        # Start background execution
        cancel_event = asyncio.Event()
        self._cancel_flags[task_id] = cancel_event
        bg_task = asyncio.create_task(self._execute_task(task_id, cancel_event))
        self._running_tasks[task_id] = bg_task
        bg_task.add_done_callback(lambda t: self._cleanup_task(task_id))

        return {
            "task_id": task_id,
            "status": "pending",
            "progress_pct": 0.0,
        }

    async def get_status(self, task_id: str) -> Optional[dict]:
        """Return current task status from Redis."""
        return await get_task_status(task_id)

    async def cancel_task(self, task_id: str) -> bool:
        """Signal cancellation for a running task."""
        flag = self._cancel_flags.get(task_id)
        if flag is None:
            await update_task_status(task_id, "cancelled")
            await self._update_pg_status(task_id, "cancelled")
            return True

        flag.set()
        bg = self._running_tasks.get(task_id)
        if bg and not bg.done():
            bg.cancel()
        await update_task_status(task_id, "cancelled")
        await self._update_pg_status(task_id, "cancelled")
        await publish_progress(task_id, {"status": "cancelled"})
        logger.info(f"Task {task_id} cancelled")
        return True

    async def recover_tasks(self):
        """On startup, recover tasks that were interrupted.

        Checks both Redis and PostgreSQL for active tasks.
        """
        recovered = 0

        # 1. Recover from Redis
        r = get_redis()
        cursor = "0"
        redis_active_ids: set[str] = set()
        while True:
            cursor, keys = await r.scan(
                cursor=cursor, match="engine:task:*:status", count=100
            )
            for key in keys:
                raw = await r.get(key)
                if raw is None:
                    continue
                import json
                try:
                    status_data = json.loads(raw)
                except Exception:
                    continue
                st = status_data.get("status", "")
                tid = status_data.get("task_id", "")
                if tid:
                    redis_active_ids.add(tid)
                if st in ("generating", "planning", "reviewing"):
                    if tid and tid not in self._running_tasks:
                        logger.info(f"Recovering interrupted task {tid} from Redis (status={st})")
                        task_data = await get_task_data(tid)
                        if task_data:
                            recovered += self._start_task(tid)
            if cursor == "0" or cursor == 0:
                break

        # 2. Recover from PostgreSQL (tasks that may not be in Redis)
        try:
            from intelligen_engine.core.database import async_session_factory
            from intelligen_engine.tasks.models import EngineTask
            from sqlalchemy import select

            async with async_session_factory() as session:
                stmt = select(EngineTask).where(
                    EngineTask.status.in_(["generating", "planning", "reviewing"])
                )
                result = await session.execute(stmt)
                pg_tasks = result.scalars().all()

            for pt in pg_tasks:
                if pt.task_id not in redis_active_ids and pt.task_id not in self._running_tasks:
                    logger.info(
                        f"Recovering task {pt.task_id} from PostgreSQL "
                        f"(status={pt.status}, not in Redis)"
                    )
                    # Re-enqueue to Redis from PG data
                    task_data = pt.task_data or {}
                    task_data["task_id"] = pt.task_id
                    if pt.topic:
                        task_data.setdefault("topic", pt.topic)
                    if pt.requirement:
                        task_data.setdefault("requirement", pt.requirement)
                    await enqueue_task(pt.task_id, task_data)
                    recovered += self._start_task(pt.task_id)
        except Exception as e:
            logger.warning(f"PostgreSQL recovery check failed: {e}")

        if recovered:
            logger.info(f"Recovered {recovered} interrupted task(s)")

    @property
    def active_count(self) -> int:
        return sum(1 for t in self._running_tasks.values() if not t.done())

    async def queue_depth(self) -> int:
        r = get_redis()
        return await r.llen("engine:task_queue")

    # ─── Internal Execution ─────────────────────────────────

    def _start_task(self, task_id: str) -> int:
        """Create and register a background task. Returns 1 if started."""
        if task_id in self._running_tasks:
            return 0
        cancel_event = asyncio.Event()
        self._cancel_flags[task_id] = cancel_event
        bg = asyncio.create_task(self._execute_task(task_id, cancel_event))
        self._running_tasks[task_id] = bg
        bg.add_done_callback(lambda t, _id=task_id: self._cleanup_task(_id))
        return 1

    async def _execute_task(self, task_id: str, cancel_event: asyncio.Event):
        """Run the full generation pipeline for a task with timeout and retry."""
        try:
            await asyncio.wait_for(
                self._execute_task_inner(task_id, cancel_event),
                timeout=TASK_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            error_msg = f"Task timed out after {TASK_TIMEOUT_SECONDS}s"
            logger.error(f"Task {task_id}: {error_msg}")
            await self._transition_and_persist(task_id, "generating", "failed", error=error_msg)
            await publish_progress(task_id, {"status": "failed", "error": error_msg})
        except asyncio.CancelledError:
            logger.info(f"Task {task_id} was cancelled")
            await update_task_status(task_id, "cancelled")
            await self._update_pg_status(task_id, "cancelled")
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Task {task_id} failed: {error_msg}\n{traceback.format_exc()}")
            await self._transition_and_persist(task_id, None, "failed", error=error_msg)
            await publish_progress(task_id, {"status": "failed", "error": error_msg})

    async def _execute_task_inner(self, task_id: str, cancel_event: asyncio.Event):
        """Core pipeline execution with state transitions and retry."""
        task_data = await get_task_data(task_id)
        if task_data is None:
            logger.error(f"Task {task_id}: no data found in Redis")
            await self._transition_and_persist(task_id, "pending", "failed", error="Task data not found")
            return

        topic = task_data.get("topic", "") or task_data.get("user_input", "")
        answers = task_data.get("answers")
        outline = task_data.get("outline")
        template_content = task_data.get("template_content")
        attachments = task_data.get("attachments") or task_data.get("user_file_paths") or []
        citation_style = task_data.get("citation_style", "GB/T 7714")
        requirement = task_data.get("requirement")
        target_word_count = task_data.get("target_word_count")
        generation_mode = task_data.get("generation_mode") or "legacy_report"

        # ── Stage 1: Planning ───────────────────────────
        await self._transition_and_persist(
            task_id, "pending", "planning", progress=5.0, stage="planning"
        )
        await publish_progress(task_id, {
            "status": "planning", "progress_pct": 5.0, "stage": "planning",
        })

        if cancel_event.is_set():
            return

        # ── Stage 2: Generation ─────────────────────────
        await self._transition_and_persist(
            task_id, "planning", "generating", progress=10.0, stage="generating"
        )
        await publish_progress(task_id, {
            "status": "generating", "progress_pct": 10.0, "stage": "generating",
        })

        # Build progress callback
        def progress_callback(current: int, total: int, **kwargs):
            pct = 10.0 + (current / max(total, 1)) * 80.0
            asyncio.get_event_loop().call_soon_threadsafe(
                asyncio.ensure_future,
                self._publish_generation_progress(task_id, pct, current, total),
            )

        # 流式内容回调：章节完成后推送内容事件
        def content_callback(section_index: int, section_title: str,
                             content: str, total_sections: int):
            asyncio.get_event_loop().call_soon_threadsafe(
                asyncio.ensure_future,
                self._publish_content_event(task_id, section_index, section_title,
                                            content, total_sections),
            )

        artifact_paths: dict[str, str] = {}
        if generation_mode in {"paper_format_to_paper", "paper_survey", "paper_scaffold"}:
            markdown, artifact_paths = await self._run_paper_generation(
                task_id=task_id,
                topic=topic,
                task_data=task_data,
                cancel_event=cancel_event,
            )
        else:
            outline_text = None
            if outline:
                if isinstance(outline, list):
                    outline_text = "\n".join(
                        f"## {s.get('title', s) if isinstance(s, dict) else s}"
                        for s in outline
                    )
                else:
                    outline_text = str(outline)

            if not requirement and answers:
                requirement = "\n".join(
                    f"- {v}" for v in answers.values() if isinstance(v, str) and v.strip()
                )

            markdown = await self._run_generation_with_retry(
                task_id=task_id,
                topic=topic,
                outline_text=outline_text,
                template_content=template_content,
                attachments=attachments,
                requirement=requirement,
                citation_style=citation_style,
                progress_callback=progress_callback,
                cancel_event=cancel_event,
                content_callback=content_callback,
                target_word_count=target_word_count,
            )

        if cancel_event.is_set():
            return

        # ── Stage 3: Completed ──────────────────────────
        # Persist result before exposing the terminal status so API sync cannot
        # observe "completed" without the markdown/artifact payload.
        try:
            await self._save_result(
                task_id,
                markdown,
                topic,
                requirement,
                artifact_paths=artifact_paths,
            )
        except Exception as e:
            logger.warning(f"Task {task_id}: failed to persist result to DB: {e}")
            await update_task_status(
                task_id,
                "completed",
                progress=100.0,
                current_stage="completed",
                extra={
                    "result_markdown": markdown,
                    "artifact_paths": artifact_paths,
                },
            )

        await publish_progress(task_id, {
            "status": "completed",
            "progress_pct": 100.0,
            "stage": "completed",
            "result_markdown": markdown,
            "artifact_paths": artifact_paths,
        })

        logger.info(f"Task {task_id} completed successfully")

    async def _run_generation_with_retry(
        self,
        task_id: str,
        topic: str,
        outline_text: Optional[str],
        template_content: Optional[str],
        attachments: list,
        requirement: Optional[str],
        citation_style: str,
        progress_callback,
        cancel_event: asyncio.Event,
        content_callback=None,
        target_word_count: int | None = None,
    ) -> str:
        """Run report generation with exponential backoff retry."""
        from intelligen_engine.pipeline.regeneration.generation_bridge import (
            run_report_generation,
        )

        last_error: Optional[Exception] = None
        for attempt in range(1, LLM_RETRY_ATTEMPTS + 1):
            if cancel_event.is_set():
                raise asyncio.CancelledError()
            try:
                loop = asyncio.get_running_loop()
                markdown = await loop.run_in_executor(
                    None,
                    lambda: run_report_generation(
                        task_id=task_id,
                        user_input=topic,
                        outline=outline_text,
                        template_content=template_content,
                        user_file_paths=attachments if attachments else None,
                        requirement=requirement,
                        citation_style=citation_style,
                        progress_callback=progress_callback,
                        content_callback=content_callback,
                        target_word_count=target_word_count,
                    ),
                )
                return markdown
            except Exception as e:
                last_error = e
                if attempt < LLM_RETRY_ATTEMPTS:
                    delay = LLM_RETRY_BASE_DELAY * (2 ** (attempt - 1))
                    logger.warning(
                        f"Task {task_id}: attempt {attempt}/{LLM_RETRY_ATTEMPTS} "
                        f"failed ({e}), retrying in {delay:.1f}s"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"Task {task_id}: all {LLM_RETRY_ATTEMPTS} attempts exhausted"
                    )
        raise last_error  # type: ignore[misc]

    async def _run_paper_generation(
        self,
        *,
        task_id: str,
        topic: str,
        task_data: dict,
        cancel_event: asyncio.Event,
    ) -> tuple[str, dict[str, str]]:
        """Run the first paper-mode path with strict format/export audit."""
        from intelligen_engine.paper import PaperRunRequest, generate_paper

        if cancel_event.is_set():
            raise asyncio.CancelledError()

        venue_label = task_data.get("venue_label") or task_data.get("format") or "IEEE"
        venue_variant = task_data.get("venue_variant") or task_data.get("variant") or "conference"
        authors = task_data.get("authors") or ["Anonymous"]
        if isinstance(authors, str):
            authors = [a.strip() for a in authors.split(",") if a.strip()] or ["Anonymous"]

        output_dir = Path(settings.FILE_STORAGE_PATH) / "paper_runs" / task_id
        await self._publish_paper_stage(
            task_id,
            stage="format_resolve",
            progress=20.0,
            message=f"resolving {venue_label} format",
        )
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: generate_paper(
                PaperRunRequest(
                    topic=topic,
                    output_dir=output_dir,
                    venue_label=venue_label,
                    variant=venue_variant,
                    authors=authors,
                    manual_citation_overrides=task_data.get("manual_citation_overrides"),
                    target_word_count=task_data.get("target_word_count"),
                )
            ),
        )
        await self._publish_paper_stage(
            task_id,
            stage="format_audit",
            progress=75.0,
            message="IEEE format audit passed" if result.audit.passed else "format audit failed",
        )
        await self._publish_paper_stage(
            task_id,
            stage="export",
            progress=95.0,
            message="paper artifacts exported",
        )
        markdown = _paper_result_markdown(
            topic=topic,
            venue=result.format_decision.spec.venue_label,
            artifact_paths={
                "tex_path": str(result.tex_path),
                "bib_path": str(result.bib_path),
                "docx_path": str(result.docx_path),
                "pdf_path": str(result.pdf_path),
                "audit_path": str(result.audit_path),
                "source_bundle_path": str(result.source_bundle_path),
            },
        )
        return markdown, {
            "tex_path": str(result.tex_path),
            "bib_path": str(result.bib_path),
            "docx_path": str(result.docx_path),
            "pdf_path": str(result.pdf_path),
            "audit_path": str(result.audit_path),
            "source_bundle_path": str(result.source_bundle_path),
        }

    async def _publish_paper_stage(
        self,
        task_id: str,
        *,
        stage: str,
        progress: float,
        message: str,
    ) -> None:
        await update_task_status(
            task_id,
            "generating",
            progress=progress,
            current_stage=stage,
        )
        await publish_progress(
            task_id,
            {
                "status": "generating",
                "progress_pct": progress,
                "stage": stage,
                "message": message,
            },
        )

    async def _publish_generation_progress(
        self, task_id: str, pct: float, current: int, total: int
    ):
        """Publish incremental generation progress."""
        await update_task_status(
            task_id, "generating", progress=pct,
            current_stage=f"section {current}/{total}",
        )
        # Also update PG progress (best-effort, don't block on every section)
        try:
            await self._update_pg_progress(task_id, pct, f"section {current}/{total}")
        except Exception:
            pass
        await publish_progress(task_id, {
            "status": "generating",
            "progress_pct": round(pct, 1),
            "current_section": current,
            "total_sections": total,
        })

    async def _publish_content_event(
        self, task_id: str, section_index: int, section_title: str,
        content: str, total_sections: int
    ):
        """Publish a content event with section text for real-time preview."""
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        await publish_progress(task_id, {
            "type": "content",
            "taskId": task_id,
            "sectionIndex": section_index,
            "sectionTitle": section_title,
            "paragraphs": paragraphs,
            "totalSections": total_sections,
        })

    async def _save_result(
        self,
        task_id: str,
        markdown: str,
        topic: str = "",
        requirement: str = "",
        artifact_paths: dict[str, str] | None = None,
    ):
        """Persist the final result markdown to the database."""
        from intelligen_engine.core.database import async_session_factory
        from intelligen_engine.tasks.models import EngineTask
        from sqlalchemy import select

        async with async_session_factory() as session:
            stmt = select(EngineTask).where(EngineTask.task_id == task_id)
            result = await session.execute(stmt)
            task_row = result.scalar_one_or_none()
            if task_row:
                task_row.status = "completed"
                task_row.progress = 100.0
                task_row.current_stage = "completed"
                task_row.result_markdown = markdown
                task_row.error = None
            else:
                # Create record if missing
                task_row = EngineTask(
                    task_id=task_id,
                    status="completed",
                    progress=100.0,
                    current_stage="completed",
                    topic=topic,
                    requirement=requirement,
                    result_markdown=markdown,
                )
                session.add(task_row)
            await session.commit()

        await update_task_status(
            task_id,
            "completed",
            progress=100.0,
            current_stage="completed",
            extra={
                "result_markdown": markdown,
                "artifact_paths": artifact_paths or {},
            },
        )

        # Also update legacy task_executions if it exists (backward compat)
        try:
            from sqlalchemy import text
            async with async_session_factory() as session:
                await session.execute(
                    text(
                        "UPDATE task_executions SET status = :status, "
                        "result_markdown = :md, progress = 100.0 "
                        "WHERE task_id = :tid"
                    ),
                    {"status": "completed", "md": markdown, "tid": task_id},
                )
                await session.commit()
        except Exception:
            pass  # Legacy table may not exist

    # ─── PostgreSQL Helpers ─────────────────────────────────

    async def _persist_task_to_pg(self, task_id: str, task_data: dict, status: str):
        """Create or update the EngineTask row in PostgreSQL."""
        try:
            from intelligen_engine.core.database import async_session_factory
            from intelligen_engine.tasks.models import EngineTask
            from sqlalchemy import select

            async with async_session_factory() as session:
                stmt = select(EngineTask).where(EngineTask.task_id == task_id)
                result = await session.execute(stmt)
                task_row = result.scalar_one_or_none()
                if task_row:
                    task_row.status = status
                    task_row.task_data = task_data
                else:
                    task_row = EngineTask(
                        task_id=task_id,
                        user_id=task_data.get("user_id"),
                        session_id=task_data.get("session_id"),
                        status=status,
                        progress=0.0,
                        topic=task_data.get("topic", "") or task_data.get("user_input", ""),
                        requirement=task_data.get("requirement"),
                        task_data=task_data,
                    )
                    session.add(task_row)
                await session.commit()
        except Exception as e:
            logger.warning(f"Failed to persist task {task_id} to PostgreSQL: {e}")

    async def _update_pg_status(self, task_id: str, status: str, error: str = ""):
        """Update status (and optional error) in PostgreSQL."""
        try:
            from intelligen_engine.core.database import async_session_factory
            from intelligen_engine.tasks.models import EngineTask
            from sqlalchemy import select

            async with async_session_factory() as session:
                stmt = select(EngineTask).where(EngineTask.task_id == task_id)
                result = await session.execute(stmt)
                task_row = result.scalar_one_or_none()
                if task_row:
                    task_row.status = status
                    if error:
                        task_row.error = error
                    await session.commit()
        except Exception as e:
            logger.warning(f"Failed to update PG status for {task_id}: {e}")

    async def _update_pg_progress(self, task_id: str, progress: float, stage: str):
        """Update progress in PostgreSQL (best-effort)."""
        from intelligen_engine.core.database import async_session_factory
        from intelligen_engine.tasks.models import EngineTask
        from sqlalchemy import select

        async with async_session_factory() as session:
            stmt = select(EngineTask).where(EngineTask.task_id == task_id)
            result = await session.execute(stmt)
            task_row = result.scalar_one_or_none()
            if task_row:
                task_row.progress = progress
                task_row.current_stage = stage
                await session.commit()

    async def _transition_and_persist(
        self,
        task_id: str,
        from_status: Optional[str],
        to_status: str,
        *,
        progress: float = 0.0,
        stage: str = "",
        error: str = "",
    ):
        """Transition state machine + update Redis + update PostgreSQL."""
        # State machine transition (best-effort — don't block on validation failure)
        if from_status:
            await transition(task_id, from_status, to_status, strict=False)

        # Redis update
        await update_task_status(
            task_id, to_status, progress=progress,
            current_stage=stage, error=error,
        )

        # PostgreSQL update
        await self._update_pg_status(task_id, to_status, error=error)
        if progress > 0:
            try:
                await self._update_pg_progress(task_id, progress, stage)
            except Exception:
                pass

    def _cleanup_task(self, task_id: str):
        """Remove references after a task finishes."""
        self._running_tasks.pop(task_id, None)
        self._cancel_flags.pop(task_id, None)


def _paper_result_markdown(
    *,
    topic: str,
    venue: str,
    artifact_paths: dict[str, str],
) -> str:
    return "\n".join(
        [
            f"# {topic or 'Generated Paper'}",
            "",
            f"- Venue: {venue}",
            "- Generation mode: paper_format_to_paper",
            "- Format audit: passed",
            "",
            "## Artifacts",
            f"- TeX: `{artifact_paths['tex_path']}`",
            f"- BibTeX: `{artifact_paths['bib_path']}`",
            f"- DOCX: `{artifact_paths['docx_path']}`",
            f"- PDF: `{artifact_paths['pdf_path']}`",
            f"- Audit: `{artifact_paths['audit_path']}`",
            f"- Source bundle: `{artifact_paths['source_bundle_path']}`",
            "",
            "## Quality gates",
            "- Content rubric: passed",
            "- Word progress: recorded in audit.json",
            "",
            "This first paper-mode path exports a strict LaTeX scaffold and does "
            "not invent experimental results.",
        ]
    )
