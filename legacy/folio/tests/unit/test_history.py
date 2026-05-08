# SPDX-License-Identifier: MPL-2.0
"""Unit tests for HistoryStack."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.tui.history import HistoryStack


@pytest.fixture
def hist_path(tmp_path: Path) -> Path:
    return tmp_path / "history"


def test_add_persists_and_dedup(hist_path: Path) -> None:
    h = HistoryStack(hist_path)
    h.add("alpha")
    h.add("beta")
    h.add("beta")  # duplicate adjacent → dropped
    assert h.entries == ["alpha", "beta"]
    h2 = HistoryStack(hist_path)
    assert h2.entries == ["alpha", "beta"]


def test_up_walks_back_then_clamps(hist_path: Path) -> None:
    h = HistoryStack(hist_path)
    for v in ["one", "two", "three"]:
        h.add(v)
    assert h.up("draft") == "three"
    assert h.up("") == "two"
    assert h.up("") == "one"
    assert h.up("") == "one"  # clamped at oldest


def test_down_returns_to_draft(hist_path: Path) -> None:
    h = HistoryStack(hist_path)
    h.add("one")
    h.add("two")
    assert h.up("my draft") == "two"
    assert h.up("") == "one"
    assert h.down("") == "two"
    # past newest restores draft.
    assert h.down("") == "my draft"


def test_down_with_no_cursor_returns_none(hist_path: Path) -> None:
    h = HistoryStack(hist_path)
    h.add("only")
    assert h.down("anything") is None


def test_empty_history_up_is_none(hist_path: Path) -> None:
    h = HistoryStack(hist_path)
    assert h.up("draft") is None
