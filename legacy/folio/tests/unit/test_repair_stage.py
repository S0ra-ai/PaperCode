# SPDX-License-Identifier: MPL-2.0
"""Tests for the deterministic repair stage."""

from __future__ import annotations

import pytest

from app.core.contract import StageMessage
from app.core.stages.repair import _filter_bibtex, _strip_cites, repair_verify


def _msg_with(citations, bibliography, sections):
    return StageMessage(
        payload={
            "citations": citations,
            "bibliography": bibliography,
            "draft": {"sections": sections},
        },
    )


def test_filter_bibtex_drops_matching_keys():
    bib = (
        "@article{good2020,\n  title={A},\n  author={X}\n}\n\n"
        "@misc{bad2021,\n  title={B}\n}\n\n"
        "@article{good2022,\n  title={C}\n}\n"
    )
    out = _filter_bibtex(bib, {"bad2021"})
    assert "good2020" in out
    assert "good2022" in out
    assert "bad2021" not in out


def test_filter_bibtex_no_drop_returns_input():
    bib = "@article{a2020,\n  title={A}\n}\n"
    assert _filter_bibtex(bib, set()) == bib


def test_strip_cites_removes_keys_and_tidies():
    text = "Result follows (\\cite{bad}). See \\cite{good,bad} too ."
    out = _strip_cites(text, {"bad"})
    assert "bad" not in out
    assert "()" not in out
    # double space + space-before-period normalized
    assert "  " not in out
    assert " ." not in out
    assert "\\cite{good}" in out


def test_strip_cites_idempotent():
    text = "Foo \\cite{bad} bar."
    once = _strip_cites(text, {"bad"})
    twice = _strip_cites(once, {"bad"})
    assert once == twice


def test_repair_verify_drops_manual_and_strips():
    msg = _msg_with(
        citations=[
            {"key": "good2020", "source": "crossref"},
            {"key": "bad2021", "source": "manual"},
        ],
        bibliography=(
            "@article{good2020,\n  title={A}\n}\n\n"
            "@misc{bad2021,\n  note={placeholder}\n}\n"
        ),
        sections=[
            {"name": "intro", "text": "Foo (\\cite{bad2021}) bar."},
            {"name": "method", "text": "See \\cite{good2020,bad2021}."},
        ],
    )
    out = repair_verify(msg, RuntimeError("x"))
    assert [c["key"] for c in out.payload["citations"]] == ["good2020"]
    assert "bad2021" not in out.payload["bibliography"]
    intro = out.payload["draft"]["sections"][0]["text"]
    assert "bad2021" not in intro and "()" not in intro
    method = out.payload["draft"]["sections"][1]["text"]
    assert method == "See \\cite{good2020}."
    assert out.history and out.history[-1].stage == "repair"


def test_repair_verify_noop_when_nothing_to_drop():
    msg = _msg_with(
        citations=[{"key": "good", "source": "crossref"}],
        bibliography="@article{good, title={A}}\n",
        sections=[],
    )
    out = repair_verify(msg, RuntimeError("x"))
    assert out is msg  # noop returns input unchanged


@pytest.mark.asyncio
async def test_orchestrator_invokes_repair_for_verify_failure(monkeypatch):
    """End-to-end: a verify-style stage that raises, then succeeds after repair."""
    from app.core.contract import StageMessage
    from app.core.orchestrator.sequential import _run_stage

    calls = {"n": 0}

    async def flaky(msg: StageMessage) -> StageMessage:
        calls["n"] += 1
        if msg.payload.get("citations"):
            raise RuntimeError("VerifyStage: 1 unresolved citation(s): bad")
        return msg

    def repair(msg: StageMessage, exc: BaseException) -> StageMessage:
        new = msg.model_copy(deep=True)
        new.payload["citations"] = []
        return new

    msg = StageMessage(
        payload={"citations": [{"key": "bad", "source": "manual"}]},
    )

    events = []
    async for cur, ev in _run_stage("verify", flaky, msg, repairer=repair):
        events.append(ev.status)
        msg = cur

    assert events == ["started", "repairing", "repaired", "finished"]
    assert calls["n"] == 2  # once before repair, once after


@pytest.mark.asyncio
async def test_orchestrator_retries_transient_then_succeeds():
    from app.core.contract import StageMessage
    from app.core.orchestrator.sequential import _run_stage

    calls = {"n": 0}

    async def flaky(msg: StageMessage) -> StageMessage:
        calls["n"] += 1
        if calls["n"] == 1:
            raise TimeoutError("upstream timeout")
        return msg

    msg = StageMessage(payload={})
    events = []
    async for cur, ev in _run_stage("draft", flaky, msg):
        events.append(ev.status)
        msg = cur

    assert events == ["started", "retrying", "finished"]
    assert calls["n"] == 2


@pytest.mark.asyncio
async def test_orchestrator_does_not_retry_deterministic_error():
    from app.core.contract import StageMessage
    from app.core.orchestrator.sequential import _run_stage

    calls = {"n": 0}

    async def boom(msg: StageMessage) -> StageMessage:
        calls["n"] += 1
        raise ValueError("bad input")

    msg = StageMessage(payload={})
    events = []
    with pytest.raises(ValueError):
        async for _cur, ev in _run_stage("outline", boom, msg):
            events.append(ev.status)

    assert events == ["started", "failed"]
    assert calls["n"] == 1
