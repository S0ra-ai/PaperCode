# SPDX-License-Identifier: MPL-2.0
"""Per-stage StageMessage snapshots for resume.

Each completed stage writes a JSON snapshot of the current
:class:`StageMessage` under
``~/.folio/runs/<run_id>/checkpoints/<NN>-<stage>.json`` plus an
atomically-rewritten index file ``_latest.json`` carrying enough
metadata for ``folio resume`` to pick the correct orchestrator and
restart point.

Snapshots are filesystem-only (no SQLite) so they survive db migrations
and can be inspected by hand. Old checkpoints older than ``KEEP_LAST``
are pruned to bound disk usage.
"""

from __future__ import annotations

import contextlib
import json
import os
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from app.config.loader import folio_home
from app.core.contract import StageMessage

Kind = Literal["format_to_paper", "survey"]

KEEP_LAST = 20


def runs_dir() -> Path:
    return folio_home() / "runs"


def run_dir(run_id: str) -> Path:
    return runs_dir() / run_id


def _checkpoints_dir(run_id: str) -> Path:
    return run_dir(run_id) / "checkpoints"


def _latest_path(run_id: str) -> Path:
    return run_dir(run_id) / "_latest.json"


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        delete=False,
        dir=str(path.parent),
        prefix=path.name + ".",
        suffix=".tmp",
    ) as fh:
        fh.write(text)
        tmp = Path(fh.name)
    os.replace(tmp, path)


@dataclass(frozen=True)
class RunSummary:
    run_id: str
    kind: Kind
    last_stage: str
    last_idx: int
    last_at: datetime
    topic: str
    status: str  # "in_progress" | "complete" | "failed"


def save(
    msg: StageMessage,
    *,
    stage: str,
    idx: int,
    kind: Kind,
    topic: str = "",
    status: str = "in_progress",
) -> Path:
    """Write a checkpoint and refresh the ``_latest.json`` index."""
    cps = _checkpoints_dir(msg.run_id)
    cps.mkdir(parents=True, exist_ok=True)
    fname = f"{idx:02d}-{stage}.json"
    path = cps / fname
    _atomic_write(path, msg.model_dump_json(indent=2))

    _atomic_write(
        _latest_path(msg.run_id),
        json.dumps(
            {
                "run_id": msg.run_id,
                "kind": kind,
                "last_stage": stage,
                "last_idx": idx,
                "last_at": datetime.now(UTC).isoformat(),
                "topic": topic,
                "status": status,
                "checkpoint": fname,
            },
            indent=2,
        ),
    )

    _prune(cps)
    return path


def _prune(cps: Path) -> None:
    files = sorted(cps.glob("*.json"))
    if len(files) <= KEEP_LAST:
        return
    for old in files[:-KEEP_LAST]:
        with contextlib.suppress(OSError):
            old.unlink()


def _read_latest(run_id: str) -> dict | None:
    p = _latest_path(run_id)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def _summary_from_latest(run_id: str, data: dict) -> RunSummary | None:
    try:
        return RunSummary(
            run_id=run_id,
            kind=data["kind"],
            last_stage=data["last_stage"],
            last_idx=int(data["last_idx"]),
            last_at=datetime.fromisoformat(data["last_at"]),
            topic=data.get("topic", ""),
            status=data.get("status", "in_progress"),
        )
    except (KeyError, ValueError, TypeError):
        return None


def list_runs(*, limit: int = 10) -> list[RunSummary]:
    """Return the most recently updated runs (newest first)."""
    base = runs_dir()
    if not base.exists():
        return []
    summaries: list[RunSummary] = []
    for child in base.iterdir():
        if not child.is_dir():
            continue
        data = _read_latest(child.name)
        if data is None:
            continue
        s = _summary_from_latest(child.name, data)
        if s is not None:
            summaries.append(s)
    summaries.sort(key=lambda s: s.last_at, reverse=True)
    return summaries[:limit]


def find_by_prefix(prefix: str) -> list[RunSummary]:
    """Return runs whose ``run_id`` starts with ``prefix`` (case-insensitive)."""
    if not prefix:
        return list_runs(limit=10)
    pfx = prefix.lower()
    base = runs_dir()
    if not base.exists():
        return []
    out: list[RunSummary] = []
    for child in base.iterdir():
        if not child.is_dir():
            continue
        if not child.name.lower().startswith(pfx):
            continue
        data = _read_latest(child.name)
        if data is None:
            continue
        s = _summary_from_latest(child.name, data)
        if s is not None:
            out.append(s)
    out.sort(key=lambda s: s.last_at, reverse=True)
    return out


def load_message(run_id: str) -> StageMessage:
    """Load the StageMessage from the latest checkpoint of ``run_id``."""
    data = _read_latest(run_id)
    if data is None:
        raise FileNotFoundError(
            f"no _latest.json for run {run_id!r}; nothing to resume"
        )
    cp_name = data.get("checkpoint")
    if not cp_name:
        raise RuntimeError(f"_latest.json for {run_id!r} missing 'checkpoint' field")
    cp_path = _checkpoints_dir(run_id) / cp_name
    if not cp_path.exists():
        # Fall back to the highest-numbered checkpoint on disk.
        files = sorted(_checkpoints_dir(run_id).glob("*.json"))
        if not files:
            raise FileNotFoundError(
                f"no checkpoint files for {run_id!r}; cannot resume"
            )
        cp_path = files[-1]
    return StageMessage.model_validate_json(cp_path.read_text(encoding="utf-8"))


def load_summary(run_id: str) -> RunSummary:
    data = _read_latest(run_id)
    if data is None:
        raise FileNotFoundError(f"no _latest.json for run {run_id!r}")
    s = _summary_from_latest(run_id, data)
    if s is None:
        raise RuntimeError(f"corrupt _latest.json for {run_id!r}")
    return s


def mark_complete(run_id: str) -> None:
    """Flip ``status`` to ``complete`` on the latest index entry."""
    data = _read_latest(run_id)
    if data is None:
        return
    data["status"] = "complete"
    _atomic_write(_latest_path(run_id), json.dumps(data, indent=2))


def mark_failed(run_id: str, reason: str) -> None:
    data = _read_latest(run_id)
    if data is None:
        return
    data["status"] = "failed"
    data["error"] = reason[:500]
    _atomic_write(_latest_path(run_id), json.dumps(data, indent=2))
