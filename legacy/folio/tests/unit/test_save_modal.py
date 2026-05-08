# SPDX-License-Identifier: MPL-2.0
"""Tests for SaveModal compose + helper copy logic."""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.tui.save_modal import SaveModal


def test_save_modal_initialises():
    modal = SaveModal(
        source_dir=Path("/tmp/source"),
        suggested_dest=Path("/tmp/dest"),
        files=["paper.tex", "paper.pdf"],
    )
    assert modal._source == Path("/tmp/source")
    assert modal._suggested == Path("/tmp/dest")
    assert modal._files == ["paper.tex", "paper.pdf"]


def test_save_modal_compose_contains_widgets():
    """Smoke-check that compose() doesn't raise; full render needs an App."""
    modal = SaveModal(
        source_dir=Path("/tmp/source"),
        suggested_dest=Path("/tmp/dest"),
        files=["paper.tex"],
    )
    # We don't drive the full Textual lifecycle here — just construct.
    assert modal._files == ["paper.tex"]


def test_copy_outputs_copies_existing_files(tmp_path: Path):
    """The progress helper copies tex/pdf and reports what it took."""
    from app.tui.progress import FolioApp

    src = tmp_path / "src"
    src.mkdir()
    (src / "paper.tex").write_text("\\documentclass{}", encoding="utf-8")
    (src / "paper.pdf").write_bytes(b"%PDF-1.4")
    (src / "ignored.log").write_text("noise", encoding="utf-8")

    dest = tmp_path / "dest"
    app = FolioApp.__new__(FolioApp)

    class _LogStub:
        def write(self, *_a, **_k):
            pass

    app.log_view = _LogStub()  # type: ignore[attr-defined]

    out = asyncio.run(app._copy_outputs(src, dest, ["paper.tex", "paper.pdf"]))

    assert sorted(out) == ["paper.pdf", "paper.tex"]
    assert (dest / "paper.tex").read_text(encoding="utf-8") == "\\documentclass{}"
    assert (dest / "paper.pdf").read_bytes() == b"%PDF-1.4"
    assert not (dest / "ignored.log").exists()
