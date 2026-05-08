# SPDX-License-Identifier: MPL-2.0
"""ExportLatex stage test (no LLM, no compiler)."""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.core.contract import StageMessage
from app.core.formats import FormatSpec
from app.core.stages import export_latex


def _msg() -> StageMessage:
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
                "title": "A Study of $Transformers$ & Co.",
                "abstract_brief": "We study things.",
                "keywords": ["transformer", "time-series"],
                "sections": [
                    {"name": "Introduction", "text": "Hello \\cite{smith2024a}."},
                    {"name": "Method", "text": "Methods."},
                ],
            },
            "bibliography": "@article{smith2024a, title={X}, author={Smith, J}, year={2024}}",
            "clarify": {"author": "Folio User"},
        }
    )


def test_export_latex_writes_files(tmp_path: Path) -> None:
    out = asyncio.run(export_latex.run(_msg(), output_dir=tmp_path))
    tex = Path(out.payload["exports"]["tex"])
    bib = Path(out.payload["exports"]["bib"])
    assert tex.exists() and bib.exists()
    body = tex.read_text(encoding="utf-8")
    assert "\\section{ Introduction }" in body
    assert "Transformers" in body
    # Title contains '$' & '&' that must be escaped.
    assert "\\$Transformers\\$" in body
    assert "\\&" in body
    assert "smith2024a" in bib.read_text(encoding="utf-8")


def test_export_latex_ieee_contract(tmp_path: Path) -> None:
    out = asyncio.run(export_latex.run(_msg(), output_dir=tmp_path))
    body = Path(out.payload["exports"]["tex"]).read_text(encoding="utf-8")

    assert "\\documentclass[10pt,letterpaper,conference]{IEEEtran}" in body
    assert "\\documentclass" in body
    assert "{article}" not in body
    assert "\\tableofcontents" not in body
    assert "\\begin{IEEEkeywords}" in body
    assert "\\bibliographystyle{IEEEtran}" in body


def test_export_latex_falls_back_to_generic(tmp_path: Path) -> None:
    msg = _msg()
    msg.payload["format_spec"]["template_hint"] = "no_such.tex.j2"
    out = asyncio.run(export_latex.run(msg, output_dir=tmp_path))
    body = Path(out.payload["exports"]["tex"]).read_text(encoding="utf-8")
    assert "\\documentclass" in body  # generic still rendered
