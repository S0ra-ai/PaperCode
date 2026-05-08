# SPDX-License-Identifier: MPL-2.0
"""Unit tests for app.persistence.snapshots."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from app.core.contract import StageMessage, StageRecord
from app.persistence import snapshots


def _msg(run_id: str, payload: dict | None = None) -> StageMessage:
    return StageMessage(run_id=run_id, payload=payload or {"k": "v"})


def _record(stage: str) -> StageRecord:
    now = datetime.now(UTC)
    return StageRecord(stage=stage, started_at=now, finished_at=now)


def test_save_writes_checkpoint_and_index(_isolate_folio_home: Path) -> None:
    msg = _msg("aabb1122").with_record(_record("format"))
    snapshots.save(msg, stage="format", idx=1, kind="format_to_paper", topic="t")
    cps = _isolate_folio_home / "runs" / "aabb1122" / "checkpoints"
    assert (cps / "01-format.json").exists()
    latest = _isolate_folio_home / "runs" / "aabb1122" / "_latest.json"
    data = json.loads(latest.read_text())
    assert data["last_stage"] == "format"
    assert data["last_idx"] == 1
    assert data["kind"] == "format_to_paper"
    assert data["topic"] == "t"
    assert data["status"] == "in_progress"
    assert data["checkpoint"] == "01-format.json"


def test_load_message_round_trip(_isolate_folio_home: Path) -> None:
    msg = _msg("ccdd3344", payload={"hello": "world"})
    snapshots.save(msg, stage="outline", idx=2, kind="survey", topic="x")
    loaded = snapshots.load_message("ccdd3344")
    assert loaded.run_id == "ccdd3344"
    assert loaded.payload == {"hello": "world"}


def test_list_runs_orders_newest_first(_isolate_folio_home: Path) -> None:
    snapshots.save(_msg("aaaa"), stage="format", idx=1, kind="format_to_paper")
    snapshots.save(_msg("bbbb"), stage="format", idx=1, kind="survey")
    rows = snapshots.list_runs()
    assert {r.run_id for r in rows} == {"aaaa", "bbbb"}
    assert rows == sorted(rows, key=lambda r: r.last_at, reverse=True)


def test_find_by_prefix_unique(_isolate_folio_home: Path) -> None:
    snapshots.save(_msg("aaaa1111"), stage="x", idx=1, kind="format_to_paper")
    snapshots.save(_msg("bbbb2222"), stage="x", idx=1, kind="format_to_paper")
    matches = snapshots.find_by_prefix("aaaa")
    assert len(matches) == 1
    assert matches[0].run_id == "aaaa1111"


def test_find_by_prefix_ambiguous(_isolate_folio_home: Path) -> None:
    snapshots.save(_msg("aabbcc01"), stage="x", idx=1, kind="format_to_paper")
    snapshots.save(_msg("aabbcc02"), stage="x", idx=1, kind="format_to_paper")
    matches = snapshots.find_by_prefix("aabbcc")
    assert len(matches) == 2


def test_prune_keeps_last_n(_isolate_folio_home: Path, monkeypatch) -> None:
    monkeypatch.setattr(snapshots, "KEEP_LAST", 3)
    rid = "prune001"
    for i in range(7):
        snapshots.save(_msg(rid), stage=f"s{i}", idx=i, kind="format_to_paper")
    cps = sorted((_isolate_folio_home / "runs" / rid / "checkpoints").glob("*.json"))
    assert len(cps) == 3
    assert cps[-1].name.startswith("06")


def test_mark_complete_and_failed(_isolate_folio_home: Path) -> None:
    rid = "stat001"
    snapshots.save(_msg(rid), stage="export_latex", idx=8, kind="format_to_paper")
    snapshots.mark_complete(rid)
    assert snapshots.load_summary(rid).status == "complete"
    snapshots.mark_failed(rid, "boom")
    assert snapshots.load_summary(rid).status == "failed"


def test_load_message_missing_raises(_isolate_folio_home: Path) -> None:
    import pytest

    with pytest.raises(FileNotFoundError):
        snapshots.load_message("nope")
