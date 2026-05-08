# SPDX-License-Identifier: MPL-2.0
"""JSONL trace writer.

Per AGENTS.md § 1.4, every LLM call writes a trace record. Records go
to `~/.folio/trace/<YYYY-MM-DD>.jsonl`, one JSON object per line.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Any

from pydantic import BaseModel, Field


def _trace_dir() -> Path:
    root = Path(os.environ.get("FOLIO_HOME", str(Path.home() / ".folio")))
    d = root / "trace"
    d.mkdir(parents=True, exist_ok=True)
    return d


class TraceEvent(BaseModel):
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))
    run_id: str
    stage: str
    provider_label: str | None = None
    model: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    request_hash: str | None = None
    response_hash: str | None = None
    note: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


_lock = Lock()


def write(event: TraceEvent) -> None:
    """Append a single trace event; thread-safe within one process."""
    path = _trace_dir() / f"{event.ts.strftime('%Y-%m-%d')}.jsonl"
    line = event.model_dump_json() + "\n"
    with _lock, path.open("a", encoding="utf-8") as fh:
        fh.write(line)


def read_for_run(run_id: str) -> list[TraceEvent]:
    """Read all trace events matching ``run_id`` from today's file.

    Used by the live HUD to aggregate tokens/cost; cheap because we only
    scan the current day's file (one line per LLM call).
    """
    path = _trace_dir() / f"{datetime.now(UTC).strftime('%Y-%m-%d')}.jsonl"
    if not path.exists():
        return []
    out: list[TraceEvent] = []
    try:
        for line in path.read_text("utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                ev = TraceEvent.model_validate_json(line)
            except Exception:
                continue
            if ev.run_id == run_id:
                out.append(ev)
    except OSError:
        return []
    return out
