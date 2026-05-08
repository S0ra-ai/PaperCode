# SPDX-License-Identifier: MPL-2.0
"""Unit tests for the TaskPanel state machine (no Textual app needed)."""

from __future__ import annotations

from app.tui.task_panel import FORMAT_STAGES, SURVEY_STAGES, TaskPanel


def test_initial_rows_pending() -> None:
    panel = TaskPanel()
    rows = panel.snapshot()
    assert [r.name for r in rows] == list(FORMAT_STAGES)
    assert all(r.status == "pending" for r in rows)


def test_mark_running_then_done_records_elapsed() -> None:
    panel = TaskPanel(stages=("format", "clarify"))
    panel.mark("format", "running")
    panel.mark("format", "done")
    rows = {r.name: r for r in panel.snapshot()}
    assert rows["format"].status == "done"
    assert rows["format"].started_at is not None
    assert rows["format"].finished_at is not None
    assert rows["format"].elapsed() >= 0


def test_mark_unknown_stage_appends() -> None:
    panel = TaskPanel(stages=("format",))
    panel.mark("custom", "running")
    names = [r.name for r in panel.snapshot()]
    assert "custom" in names


def test_mark_failed_keeps_detail() -> None:
    panel = TaskPanel(stages=("draft",))
    panel.mark("draft", "failed", detail="boom")
    row = panel.snapshot()[0]
    assert row.status == "failed"
    assert row.detail == "boom"


def test_set_stages_replaces() -> None:
    panel = TaskPanel()
    panel.set_stages(SURVEY_STAGES)
    assert [r.name for r in panel.snapshot()] == list(SURVEY_STAGES)


def test_reset_clears_status() -> None:
    panel = TaskPanel(stages=("format", "clarify"))
    panel.mark("format", "done")
    panel.reset()
    rows = panel.snapshot()
    assert all(r.status == "pending" for r in rows)
    assert all(r.started_at is None for r in rows)
