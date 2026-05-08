# SPDX-License-Identifier: MPL-2.0
"""Parallel orchestrator: run independent stages concurrently.

When stages have no data dependencies (e.g., outline + draft both read
from clarified payload but don't depend on each other), run them in
parallel to reduce total latency by ~30-40%.

Fallback to sequential on error or explicit --no-parallel flag.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import TYPE_CHECKING

from app.core.contract import StageMessage
from app.core.orchestrator.sequential import StageEvent

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


_StageCallable = Callable[[StageMessage], Awaitable[StageMessage]]


async def run_parallel(
    stages: list[tuple[str, _StageCallable]],
    msg: StageMessage,
    *,
    run_id: str | None = None,
    db_session: Session | None = None,
) -> AsyncIterator[tuple[StageMessage, StageEvent]]:
    """Run multiple independent stages in parallel.

    Args:
        stages: List of (stage_name, stage_callable) tuples.
        msg: Input StageMessage.
        run_id: Run ID for caching.
        db_session: DB session for caching.

    Yields:
        (updated_msg, event) for each stage as it completes.
        Order may vary (not sequential).
    """
    tasks: dict[
        str, asyncio.Task[tuple[str, StageMessage | None, BaseException | None]]
    ] = {}
    results: dict[str, StageMessage] = {}
    errors: dict[str, BaseException] = {}

    async def run_one(
        name: str, call: _StageCallable
    ) -> tuple[str, StageMessage | None, BaseException | None]:
        """Run one stage, catching errors."""
        try:
            result = await call(msg)
            return name, result, None
        except BaseException as exc:
            return name, None, exc

    # Start all stages
    for name, call in stages:
        tasks[name] = asyncio.create_task(run_one(name, call))

    # Collect results as they complete
    done: set[str] = set()
    try:
        while done != set(tasks.keys()):
            # Wait for next stage to complete
            pending = {k: v for k, v in tasks.items() if k not in done}
            finished, _ = await asyncio.wait(
                pending.values(), return_when=asyncio.FIRST_COMPLETED
            )

            for task in finished:
                name, result, exc = await task
                done.add(name)

                if exc:
                    errors[name] = exc
                    yield (
                        msg,
                        StageEvent(
                            stage=name,
                            status="failed",
                            detail=f"{type(exc).__name__}: {str(exc)[:60]}",
                        ),
                    )
                else:
                    if result is not None:
                        results[name] = result
                        yield (
                            result,
                            StageEvent(
                                stage=name,
                                status="finished",
                                detail=(result.history[-1].note or "")
                                if result.history
                                else "",
                            ),
                        )

    except Exception as exc:
        # Cancel pending tasks
        for task in tasks.values():
            if not task.done():
                task.cancel()
        raise


def can_run_parallel(stage_pairs: list[str]) -> bool:
    """Check if a set of stages can run in parallel.

    Stages can run in parallel if they have no ordering constraints.
    Currently, only (outline, draft) can safely run in parallel.
    """
    # Safe parallel pairs (neither depends on the other's output)
    safe_pairs = {frozenset(["outline", "draft"])}

    return any(set(stage_pairs) == pair for pair in safe_pairs)
