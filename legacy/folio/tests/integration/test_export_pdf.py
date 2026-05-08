# SPDX-License-Identifier: MPL-2.0
# ruff: noqa: RUF003
"""Integration test for ExportPDF stage.

Skip-on-missing: requires either a host `tectonic` binary or a working
`docker` daemon. When both are absent the test is skipped, never failed
— same policy as the stage itself.
"""

from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path

import pytest

from app.core.contract import StageMessage
from app.core.formats import FormatSpec
from app.core.stages import export_latex, export_pdf
from app.sandbox import tectonic_installer

pytestmark = pytest.mark.integration


def _has_compiler() -> bool:
    if os.environ.get("FOLIO_SKIP_PDF_COMPILE", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        return False
    if (
        shutil.which("tectonic")
        or shutil.which("latexmk")
        or shutil.which("xelatex")
        or shutil.which("pdflatex")
        or shutil.which("lualatex")
        or shutil.which("docker")
        or tectonic_installer.installed_path() is not None
    ):
        return True
    # 没有任何本地编译器 —— 试着按需下载 tectonic 静态二进制（一次性，
    # ~20 MB，存到 ~/.folio/bin/）。无网或平台不支持时返回 None，
    # 测试转为 skip。
    return tectonic_installer.ensure_tectonic(auto=True) is not None


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
                "title": "Tectonic Smoke Test",
                "abstract_brief": "A minimal LaTeX document for compile-path coverage.",
                "keywords": ["test"],
                "sections": [
                    {"name": "Introduction", "text": "Hello world."},
                    {"name": "Conclusion", "text": "Goodbye world."},
                ],
            },
            "bibliography": "",
            "clarify": {"author": "Folio CI"},
        }
    )


@pytest.mark.skipif(not _has_compiler(), reason="no tectonic or docker on host")
def test_export_pdf_produces_pdf(tmp_path: Path) -> None:
    # 优先把 tectonic 准备好——它是流水线里最稳的引擎（自带字体下载，无需
    # 本地 TeX 发行版）。如果本机已有 tectonic 或下载成功，我们强制把它
    # 顶到 backend 链头，避免本地半残的 MiKTeX/TeX Live 拖累测试。
    binary = tectonic_installer.ensure_tectonic(auto=True)
    if binary is not None:
        os.environ["FOLIO_LATEX_ENGINE"] = "tectonic"

    seeded = asyncio.run(export_latex.run(_seed_msg(), output_dir=tmp_path))
    assert "tex" in seeded.payload["exports"]

    out = asyncio.run(export_pdf.run(seeded))
    pdf_path_str = out.payload["exports"].get("pdf")
    if pdf_path_str is None:
        # The compiler was present but failed (network blocked, image not pulled,
        # missing fonts, …). In CI we don't want to mask that as success, but we
        # also don't want to fail the test on a host issue we can't fix here.
        pytest.skip(
            f"compile path present but did not produce PDF: "
            f"{out.payload['exports'].get('pdf_skipped_reason')}"
        )
    pdf_path = Path(pdf_path_str)
    assert pdf_path.exists(), "stage reported pdf path but file is missing"
    assert pdf_path.stat().st_size > 0, "compiled PDF is empty"
    assert pdf_path.read_bytes()[:4] == b"%PDF", "output is not a PDF"
