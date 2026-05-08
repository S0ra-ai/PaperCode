# SPDX-License-Identifier: MPL-2.0
"""Unit tests for the TUI builtin-format resolver."""

from __future__ import annotations

from app.tui.progress import _resolve_builtin_spec


def test_resolves_ieee_from_intent_venue() -> None:
    hit = _resolve_builtin_spec({"venue": "IEEE Trans"}, {})
    assert hit is not None
    label, spec = hit
    assert label == "IEEE"
    assert spec["schema_version"] >= 1


def test_resolves_springer_lncs_from_clarify_style() -> None:
    hit = _resolve_builtin_spec({}, {"style": "springer-lncs"})
    assert hit is not None
    assert hit[0] == "Springer-LNCS"


def test_resolves_acm_from_lower_venue() -> None:
    hit = _resolve_builtin_spec({"venue": "acm siggraph"}, {})
    assert hit is not None
    assert hit[0] == "ACM"


def test_resolves_cjc_from_chinese_style() -> None:
    hit = _resolve_builtin_spec({}, {"style": "cjc"})
    assert hit is not None
    assert hit[0] == "CJC"


def test_returns_none_for_unknown_venue() -> None:
    assert _resolve_builtin_spec({"venue": "MyOwnJournal"}, {}) is None


def test_returns_none_for_empty_inputs() -> None:
    assert _resolve_builtin_spec({}, {}) is None
