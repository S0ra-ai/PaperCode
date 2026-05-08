# SPDX-License-Identifier: MPL-2.0
"""Clarify, BibTeX, and verify-stage tests."""

from __future__ import annotations

import asyncio

import pytest

from app.core.citations.bibtex import BibEntry, format_bibtex, make_key
from app.core.contract import StageMessage
from app.core.stages import clarify, verify_refs


def test_make_key_strips_punct() -> None:
    k = make_key(first_author="Smith, John", year=2024, title="A Transformer Story")
    assert k == "smith2024a"


def test_format_bibtex_concats() -> None:
    entry = BibEntry(key="x", entry_type="article", fields={"title": "Hello {World}"})
    out = format_bibtex([entry])
    assert out.startswith("@article{x,")
    assert "Hello \\{World\\}" in out


def test_clarify_walks_required_fields() -> None:
    async def go() -> StageMessage:
        msg = StageMessage()
        for field, ans in [
            ("topic", "transformers"),
            ("venue", "IEEE"),
            ("length_pages", "8"),
            ("language", "en"),
            ("author", "Folio"),
            ("affiliation", "Folio Lab"),
            ("objective", "Survey transformer scaling laws."),
            ("audience", "researchers"),
            ("key_contributions", "a, b, c"),
        ]:
            msg = await clarify.run(msg, answer=(field, ans))
        return msg

    msg = asyncio.run(go())
    assert msg.payload["clarify_status"] == "complete"
    assert msg.payload["clarify"]["topic"] == "transformers"
    assert len([h for h in msg.history if h.stage == "clarify"]) == 9


def test_clarify_first_call_asks_topic() -> None:
    msg = asyncio.run(clarify.run(StageMessage()))
    assert msg.payload["clarify_status"] == "need_input"
    assert msg.payload["clarify_pending"]["field"] == "topic"


def test_verify_passes_when_all_resolved() -> None:
    msg = StageMessage(
        payload={
            "citations": [
                {"placeholder": "x", "key": "x2024", "source": "crossref"},
                {"placeholder": "y", "key": "y2024", "source": "arxiv"},
            ]
        }
    )
    out = asyncio.run(verify_refs.run(msg))
    assert out.payload["verify_status"] == "ok"


def test_verify_fails_closed_on_manual() -> None:
    msg = StageMessage(
        payload={
            "citations": [
                {"placeholder": "x", "key": "x2024", "source": "manual"},
            ]
        }
    )
    with pytest.raises(verify_refs.VerificationError):
        asyncio.run(verify_refs.run(msg))


def test_verify_lenient_mode_downgrades_to_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FOLIO_VERIFY_LENIENT", "1")
    msg = StageMessage(
        payload={
            "citations": [
                {"placeholder": "good", "key": "g2024", "source": "crossref"},
                {"placeholder": "bad1", "key": "b2024", "source": "manual"},
                {"placeholder": "bad2", "key": "b2025", "source": "manual"},
            ]
        }
    )
    out = asyncio.run(verify_refs.run(msg))
    assert out.payload["verify_status"] == "warnings"
    assert out.payload["verify_warnings"] == ["bad1", "bad2"]
    note = (out.history[-1].note or "").lower()
    assert "lenient" in note and "1/3" in note


def test_verify_lenient_off_by_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("FOLIO_VERIFY_LENIENT", raising=False)
    msg = StageMessage(
        payload={
            "citations": [
                {"placeholder": "x", "key": "x2024", "source": "manual"},
            ]
        }
    )
    with pytest.raises(verify_refs.VerificationError):
        asyncio.run(verify_refs.run(msg))


def test_verify_lenient_skips_when_all_resolved(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FOLIO_VERIFY_LENIENT", "true")
    msg = StageMessage(
        payload={
            "citations": [
                {"placeholder": "good", "key": "g2024", "source": "crossref"},
            ]
        }
    )
    out = asyncio.run(verify_refs.run(msg))
    assert out.payload["verify_status"] == "ok"
    assert "verify_warnings" not in out.payload
