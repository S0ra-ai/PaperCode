# SPDX-License-Identifier: MPL-2.0
"""Integration test for ExportDocx stage.

Skip-on-missing: requires a host `pandoc` binary or `docker` daemon.
When `python-docx` is not installed, fall back to a structural check
on the raw ZIP container instead of round-tripping paragraph counts.
"""

from __future__ import annotations

import asyncio
import shutil
import zipfile
from pathlib import Path

import pytest

from app.core.contract import StageMessage
from app.core.formats import FormatSpec
from app.core.stages import export_docx, export_latex

pytestmark = pytest.mark.integration


def _has_pandoc() -> bool:
    return bool(shutil.which("pandoc") or shutil.which("docker"))


def _seed_msg() -> StageMessage:
    spec = FormatSpec.model_validate(
        {
            "venue_label": "IEEE",
            "display_name": "IEEE",
            "language": "en",
            "page_size": "Letter",
            "columns": 2,
            "citation_style": "numeric",
            "template_hint": "ieee.tex.j2",
        }
    )
    return StageMessage(
        payload={
            "format_spec": spec.model_dump(mode="json"),
            "draft": {
                "title": "Pandoc Smoke Test",
                "abstract_brief": "Round-trip a tiny paper through pandoc to docx.",
                "keywords": ["test"],
                "sections": [
                    {"name": "Introduction", "text": "Intro paragraph."},
                    {"name": "Method", "text": "Method paragraph."},
                    {"name": "Conclusion", "text": "Conclusion paragraph."},
                ],
            },
            "bibliography": "",
            "clarify": {"author": "Folio CI"},
        }
    )


@pytest.mark.skipif(not _has_pandoc(), reason="no pandoc or docker on host")
def test_export_docx_produces_docx(tmp_path: Path) -> None:
    seeded = asyncio.run(export_latex.run(_seed_msg(), output_dir=tmp_path))
    out = asyncio.run(export_docx.run(seeded))
    docx_path_str = out.payload["exports"].get("docx")
    if docx_path_str is None:
        pytest.skip(
            f"pandoc path present but did not produce DOCX: "
            f"{out.payload['exports'].get('docx_skipped_reason')}"
        )
    docx_path = Path(docx_path_str)
    assert docx_path.exists()
    assert docx_path.stat().st_size > 0

    # docx is a zip container — every valid one has word/document.xml.
    with zipfile.ZipFile(docx_path) as zf:
        names = zf.namelist()
        assert "word/document.xml" in names
        body = zf.read("word/document.xml").decode("utf-8", errors="replace")

    section_count = len(_seed_msg().payload["draft"]["sections"])
    # Every section should appear as a heading in the doc body.
    for sec in _seed_msg().payload["draft"]["sections"]:
        assert sec["name"] in body, f"section {sec['name']!r} missing from docx"

    # Optional richer check when python-docx is installed.
    try:
        from docx import Document  # type: ignore[import-not-found]
    except ImportError:
        return
    doc = Document(str(docx_path))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    assert len(paragraphs) >= section_count, (
        f"expected >= {section_count} non-empty paragraphs, got {len(paragraphs)}"
    )
