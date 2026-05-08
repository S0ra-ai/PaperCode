# SPDX-License-Identifier: MPL-2.0
"""Resume integration tests — verify ``start_after`` skips already-done stages."""

from __future__ import annotations

import asyncio
from pathlib import Path

import pytest

from app.core.contract import StageMessage
from app.core.orchestrator.sequential import _Skipper
from app.core.orchestrator.sequential import run as run_sequential
from app.providers.registry import ProviderRegistry


def test_skipper_skips_through_marker_inclusive() -> None:
    sk = _Skipper(start_after="draft")
    assert sk.check("format") is True
    assert sk.check("outline") is True
    assert sk.check("draft") is True  # marker itself is skipped
    assert sk.check("cite") is False
    assert sk.check("verify") is False


def test_skipper_no_target_runs_everything() -> None:
    sk = _Skipper(start_after=None)
    for s in ("format", "outline", "draft", "cite", "verify"):
        assert sk.check(s) is False


def test_resume_after_export_docx_yields_no_events(tmp_path: Path) -> None:
    """Resuming past the last stage should produce zero events."""

    async def go() -> list[str]:
        msg = StageMessage(run_id="resume-test")
        events: list[str] = []
        async for _, ev in run_sequential(
            msg,
            pdf_path=None,  # OK: format will be skipped
            registry=ProviderRegistry(),
            output_dir=tmp_path,
            start_after="export_docx",
        ):
            events.append(f"{ev.stage}:{ev.status}")
        return events

    events = asyncio.run(go())
    assert events == []


def test_format_required_when_not_skipped() -> None:
    """Without ``start_after`` and without a PDF, format stage must complain."""

    async def go() -> None:
        msg = StageMessage(run_id="resume-test-2")
        async for _ in run_sequential(
            msg,
            pdf_path=None,
            registry=ProviderRegistry(),
            start_after=None,
        ):
            pass  # pragma: no cover

    with pytest.raises(RuntimeError, match="pdf_path is required"):
        asyncio.run(go())
