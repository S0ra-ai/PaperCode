# SPDX-License-Identifier: MPL-2.0
"""Snapshot-aware orchestrator wrapper.

Wraps an orchestrator's ``AsyncIterator[(StageMessage, StageEvent)]``
and persists a checkpoint after every ``finished`` event. On the
producer's exception, marks the run as ``failed`` so ``folio resume``
can pick it up.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from app.core.contract import StageMessage
from app.persistence import snapshots
from app.persistence.snapshots import Kind


async def snapshotted(
    stream: AsyncIterator[tuple[StageMessage, object]],
    *,
    kind: Kind,
    topic: str = "",
) -> AsyncIterator[tuple[StageMessage, object]]:
    idx = 0
    last_msg: StageMessage | None = None
    try:
        async for msg, event in stream:
            last_msg = msg
            yield msg, event
            status = getattr(event, "status", "")
            stage = getattr(event, "stage", "")
            if status == "finished":
                idx += 1
                snapshots.save(
                    msg,
                    stage=stage,
                    idx=idx,
                    kind=kind,
                    topic=topic,
                    status="in_progress",
                )
    except Exception as exc:
        if last_msg is not None:
            snapshots.mark_failed(last_msg.run_id, repr(exc))
        raise
    if last_msg is not None:
        snapshots.mark_complete(last_msg.run_id)
