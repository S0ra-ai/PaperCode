# SPDX-License-Identifier: MPL-2.0
"""Sequential orchestrator: format → outline → draft → cite → verify → export.

Clarify is **not** in this loop because it requires user interaction;
callers must drive it separately and supply a fully-clarified payload.

The orchestrator is plain async; the TUI wraps it in a worker.

Resilience
----------

Each stage call is wrapped in :func:`_run_stage`, which provides:

- One automatic retry on **transient** errors (network/IO/timeout —
  see ``_is_transient``). Deterministic errors like ``ValueError`` /
  ``VerificationError`` are not retried — they go straight to repair.
- A per-stage *repairer* hook. When the stage fails after the retry
  budget, the orchestrator calls the repairer (currently only
  ``verify`` has one — :func:`app.core.stages.repair.repair_verify`),
  emits ``repairing``/``repaired`` events, and tries the stage one
  last time on the patched payload.
- Backoff with jitter so retries don't stampede a rate-limited
  provider.

This lives in ``core`` per AGENTS.md §1.1 — the TUI only renders the
new event statuses (``retrying``, ``repairing``, ``repaired``).
"""

from __future__ import annotations

import asyncio
import random
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import httpx

from app.config.loader import ExperimentDefaults
from app.core.contract import StageMessage
from app.core.stages import (
    cite_fetch,
    export_docx,
    export_latex,
    export_pdf,
    format_stage,
    verify_refs,
)
from app.core.stages import (
    code as code_stage,
)
from app.core.stages import (
    draft as draft_stage,
)
from app.core.stages import (
    experiment_write as experiment_write_stage,
)
from app.core.stages import (
    outline as outline_stage,
)
from app.core.stages import (
    repair as repair_stage,
)
from app.core.stages.stage_cache import (
    hash_inputs,
    lookup_stage_cache,
    save_stage_cache,
)
from app.providers.registry import ProviderRegistry
from app.sandbox import SandboxRunner

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


@dataclass(frozen=True)
class StageEvent:
    stage: str
    status: str  # started | finished | failed | retrying | repairing | repaired
    detail: str = ""


class _Skipper:
    """Skip every stage up to and including ``start_after`` (inclusive).

    The marker stage was the last one that completed successfully, so the
    resumed run starts at the *next* stage. ``check`` returns True iff
    the stage should be skipped this round.
    """

    def __init__(self, start_after: str | None) -> None:
        self._target = start_after
        self._still_skipping = start_after is not None

    def check(self, stage: str) -> bool:
        if not self._still_skipping:
            return False
        if stage == self._target:
            self._still_skipping = False
        return True


_TRANSIENT_TYPES: tuple[type[BaseException], ...] = (
    httpx.HTTPError,
    asyncio.TimeoutError,
    ConnectionError,
    OSError,
)


def _is_transient(exc: BaseException) -> bool:
    """Heuristic: should we retry this error before invoking the repairer?"""
    if isinstance(exc, _TRANSIENT_TYPES):
        return True
    msg = str(exc).lower()
    return any(
        token in msg
        for token in ("timeout", "rate limit", "rate_limit", "503", "502", "504")
    )


async def _backoff(attempt: int) -> None:
    base = min(2.0**attempt, 8.0)
    await asyncio.sleep(base * (0.5 + random.random() * 0.5))


_StageCallable = Callable[[StageMessage], Awaitable[StageMessage]]
_Repairer = Callable[[StageMessage, BaseException], StageMessage]


async def _run_stage(
    name: str,
    call: _StageCallable,
    msg: StageMessage,
    *,
    max_attempts: int = 2,
    repairer: _Repairer | None = None,
    run_id: str | None = None,
    db_session: Session | None = None,
) -> AsyncIterator[tuple[StageMessage, StageEvent]]:
    """Execute one stage with retry + optional repair + cache. Yields events + final msg.

    Final yield contains the new ``msg`` and a ``finished`` event. On
    unrecoverable failure, yields a ``failed`` event then re-raises.

    If `run_id` and `db_session` are provided, stage cache is checked/updated.
    """
    yield msg, StageEvent(stage=name, status="started")

    # Try cache first if available
    if run_id and db_session is not None:
        inputs_hash = hash_inputs(name, msg.payload)
        cached_msg = await lookup_stage_cache(run_id, name, inputs_hash, db_session)
        if cached_msg is not None:
            yield (
                cached_msg,
                StageEvent(
                    stage=name,
                    status="finished",
                    detail="(cached)",
                ),
            )
            return

    attempt = 0
    last_exc: BaseException | None = None
    while attempt < max_attempts:
        attempt += 1
        try:
            new = await call(msg)
        except BaseException as exc:
            last_exc = exc
            if attempt < max_attempts and _is_transient(exc):
                yield (
                    msg,
                    StageEvent(
                        stage=name, status="retrying", detail=f"{type(exc).__name__}"
                    ),
                )
                await _backoff(attempt)
                continue
            break
        else:
            # Cache result if enabled
            if run_id and db_session is not None:
                inputs_hash = hash_inputs(name, msg.payload)
                await save_stage_cache(run_id, name, inputs_hash, new, db_session)

            yield (
                new,
                StageEvent(
                    stage=name,
                    status="finished",
                    detail=(new.history[-1].note or "") if new.history else "",
                ),
            )
            return

    # Retries exhausted — try the repairer.
    if repairer is not None and last_exc is not None:
        yield (
            msg,
            StageEvent(
                stage=name,
                status="repairing",
                detail=str(last_exc)[:80],
            ),
        )
        try:
            patched = repairer(msg, last_exc)
        except Exception as repair_exc:
            yield (
                msg,
                StageEvent(
                    stage=name,
                    status="failed",
                    detail=f"repair raised {type(repair_exc).__name__}: "
                    f"{str(repair_exc)[:60]}",
                ),
            )
            raise last_exc from repair_exc
        yield (
            patched,
            StageEvent(stage=name, status="repaired", detail=""),
        )
        try:
            new = await call(patched)
        except BaseException as exc:
            yield (
                patched,
                StageEvent(
                    stage=name,
                    status="failed",
                    detail=f"after repair: {type(exc).__name__}: {str(exc)[:60]}",
                ),
            )
            raise
        # Cache result after repair
        if run_id and db_session is not None:
            inputs_hash = hash_inputs(name, patched.payload)
            await save_stage_cache(run_id, name, inputs_hash, new, db_session)

        yield (
            new,
            StageEvent(
                stage=name,
                status="finished",
                detail=(new.history[-1].note or "") if new.history else "",
            ),
        )
        return

    yield (
        msg,
        StageEvent(
            stage=name,
            status="failed",
            detail=f"{type(last_exc).__name__}: {str(last_exc)[:80]}"
            if last_exc
            else "unknown error",
        ),
    )
    assert last_exc is not None
    raise last_exc


async def run(
    msg: StageMessage,
    *,
    pdf_path: Path | None,
    registry: ProviderRegistry,
    venue_label: str | None = None,
    output_dir: Path | None = None,
    user_forced_refresh: bool = False,
    experiments: ExperimentDefaults | None = None,
    sandbox_runner: SandboxRunner | None = None,
    sandbox_workdir: Path | None = None,
    start_after: str | None = None,
    run_id: str | None = None,
    db_session: Session | None = None,
) -> AsyncIterator[tuple[StageMessage, StageEvent]]:
    """Drive every M1 stage in sequence; yields after each one.

    Yields ``(message_after_stage, event)`` so a TUI can update progress
    without coupling to internal stage names.

    If `run_id` and `db_session` are provided, stage cache is enabled.
    """
    skipper = _Skipper(start_after)

    if not skipper.check("format"):
        if pdf_path is None:
            raise RuntimeError(
                "sequential.run: pdf_path is required when format stage is "
                "not skipped (e.g. start_after=None)"
            )

        async def _call_format(m: StageMessage) -> StageMessage:
            return await format_stage.run(
                m,
                pdf_path=pdf_path,
                registry=registry,
                venue_label=venue_label,
                user_forced_refresh=user_forced_refresh,
            )

        async for cur, ev in _run_stage(
            "format",
            _call_format,
            msg,
            run_id=run_id,
            db_session=db_session,
        ):
            msg = cur
            yield cur, ev

    if not skipper.check("outline"):

        async def _call_outline(m: StageMessage) -> StageMessage:
            return await outline_stage.run(m, registry=registry)

        async for cur, ev in _run_stage(
            "outline",
            _call_outline,
            msg,
            run_id=run_id,
            db_session=db_session,
        ):
            msg = cur
            yield cur, ev

    if not skipper.check("draft"):

        async def _call_draft(m: StageMessage) -> StageMessage:
            return await draft_stage.run(m, registry=registry)

        async for cur, ev in _run_stage(
            "draft",
            _call_draft,
            msg,
            run_id=run_id,
            db_session=db_session,
        ):
            msg = cur
            yield cur, ev

    if (
        experiments is not None
        and experiments.enabled
        and sandbox_runner is not None
        and sandbox_workdir is not None
    ):
        if not skipper.check("code"):

            async def _call_code(m: StageMessage) -> StageMessage:
                return await code_stage.run(
                    m,
                    registry=registry,
                    runner=sandbox_runner,
                    workdir=sandbox_workdir,
                    mode=experiments.mode,
                    max_attempts=experiments.max_attempts,
                    timeout_s=experiments.timeout_s,
                    mem_mb=experiments.mem_mb,
                )

            async for cur, ev in _run_stage(
                "code",
                _call_code,
                msg,
                run_id=run_id,
                db_session=db_session,
            ):
                msg = cur
                yield cur, ev

        if not skipper.check("experiment_write"):

            async def _call_exp(m: StageMessage) -> StageMessage:
                return await experiment_write_stage.run(m, registry=registry)

            async for cur, ev in _run_stage(
                "experiment_write",
                _call_exp,
                msg,
                run_id=run_id,
                db_session=db_session,
            ):
                msg = cur
                yield cur, ev

    if not skipper.check("cite"):

        async def _call_cite(m: StageMessage) -> StageMessage:
            return await cite_fetch.run(m)

        async for cur, ev in _run_stage(
            "cite",
            _call_cite,
            msg,
            run_id=run_id,
            db_session=db_session,
        ):
            msg = cur
            yield cur, ev

    if not skipper.check("verify"):

        async def _call_verify(m: StageMessage) -> StageMessage:
            return await verify_refs.run(m)

        async for cur, ev in _run_stage(
            "verify",
            _call_verify,
            msg,
            repairer=repair_stage.repair_verify,
            run_id=run_id,
            db_session=db_session,
        ):
            msg = cur
            yield cur, ev

    if not skipper.check("export_latex"):

        async def _call_exlatex(m: StageMessage) -> StageMessage:
            return await export_latex.run(m, output_dir=output_dir)

        async for cur, ev in _run_stage("export_latex", _call_exlatex, msg):
            msg = cur
            yield cur, ev

    if not skipper.check("export_pdf"):

        async def _call_expdf(m: StageMessage) -> StageMessage:
            return await export_pdf.run(m)

        async for cur, ev in _run_stage("export_pdf", _call_expdf, msg):
            msg = cur
            yield cur, ev

    if not skipper.check("export_docx"):

        async def _call_exdocx(m: StageMessage) -> StageMessage:
            return await export_docx.run(m)

        async for cur, ev in _run_stage("export_docx", _call_exdocx, msg):
            msg = cur
            yield cur, ev
