# SPDX-License-Identifier: MPL-2.0
"""CJC LaTeX template / GB-T 7714 citation style smoke test."""

from __future__ import annotations

import asyncio
from pathlib import Path

from app.core.contract import StageMessage
from app.core.formats import get
from app.core.stages import export_latex


def test_cjc_builtin_maps_to_gb7714(tmp_path: Path) -> None:
    hit = get(venue_label="CJC")
    assert hit is not None
    spec, _ = hit
    msg = StageMessage(
        payload={
            "format_spec": spec.model_dump(mode="json"),
            "draft": {
                "title": "中文标题 with $math$",
                "abstract_brief": "摘要内容。",
                "keywords": ["神经网络", "时序"],
                "sections": [{"name": "引言", "text": "见 \\cite{x2024}。"}],
            },
            "bibliography": "@article{x2024, title={Y}, author={Li, W}, year={2024}}",
            "clarify": {"author": "张三"},
        }
    )
    out = asyncio.run(export_latex.run(msg, output_dir=tmp_path))
    body = Path(out.payload["exports"]["tex"]).read_text(encoding="utf-8")
    assert "gb7714-2015" in body
    assert "xeCJK" in body
    assert "中文标题" in body
    assert "\\$math\\$" in body
    assert "参考文献" in body
    # keyword joiner is the Chinese semicolon — confirm
    assert "神经网络；时序" in body  # noqa: RUF001
