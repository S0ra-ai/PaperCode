# SPDX-License-Identifier: MPL-2.0
# ruff: noqa: RUF001
"""Unit tests for the run transcript writer."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.persistence.transcript import Transcript


@pytest.fixture(autouse=True)
def _isolated_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FOLIO_HOME", str(tmp_path))


def test_lazy_open_creates_file_on_first_write(tmp_path: Path) -> None:
    t = Transcript("abc12345")
    # No file before any write.
    assert not (tmp_path / "runs" / "abc12345" / "transcript.md").exists()
    t.user("hello")
    p = tmp_path / "runs" / "abc12345" / "transcript.md"
    assert p.exists()
    txt = p.read_text("utf-8")
    assert "hello" in txt
    assert "Folio run" in txt


def test_question_with_options(tmp_path: Path) -> None:
    t = Transcript("xyz")
    t.question(
        "venue",
        "选哪个会议？",
        options=[{"label": "IEEE", "description": "通用模板"}, {"value": ""}],
    )
    txt = (tmp_path / "runs" / "xyz" / "transcript.md").read_text("utf-8")
    assert "venue" in txt
    assert "1. IEEE" in txt
    assert "通用模板" in txt


def test_stage_and_footer(tmp_path: Path) -> None:
    t = Transcript("rid")
    t.stage("draft", "started")
    t.stage("draft", "finished", detail="ok")
    t.footer("completed", "outputs: /tmp/x")
    txt = (tmp_path / "runs" / "rid" / "transcript.md").read_text("utf-8")
    assert "_draft_ **started**" in txt
    assert "_draft_ **finished** — ok" in txt
    assert "_completed_" in txt
    assert "outputs: /tmp/x" in txt


def test_assistant_writes(tmp_path: Path) -> None:
    t = Transcript("a")
    t.assistant("done")
    txt = (tmp_path / "runs" / "a" / "transcript.md").read_text("utf-8")
    assert "**folio:** done" in txt
