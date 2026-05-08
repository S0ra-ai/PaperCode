# SPDX-License-Identifier: MPL-2.0
"""Tests for app.core.experiment.parse."""

from __future__ import annotations

from app.core.experiment.parse import parse


def test_marker_extracts_metrics() -> None:
    out = 'training...\nFOLIO_RESULT:: {"metrics": {"acc": 0.91, "f1": 0.88}}\n'
    res = parse(out)
    assert res.parsed_via == "marker"
    assert res.metrics == {"acc": 0.91, "f1": 0.88}


def test_marker_picks_last_match() -> None:
    out = 'FOLIO_RESULT:: {"metrics": {"x": 1}}\nFOLIO_RESULT:: {"metrics": {"x": 2}}\n'
    res = parse(out)
    assert res.metrics == {"x": 2.0}


def test_flat_marker_object_is_treated_as_metrics() -> None:
    out = 'FOLIO_RESULT:: {"acc": 0.5, "loss": 1.2}\n'
    res = parse(out)
    assert res.metrics == {"acc": 0.5, "loss": 1.2}


def test_non_numeric_metric_falls_into_extra() -> None:
    out = 'FOLIO_RESULT:: {"metrics": {"acc": 0.5, "label": "baseline"}, "seed": 1}\n'
    res = parse(out)
    assert res.metrics == {"acc": 0.5}
    assert res.extra == {"label": "baseline", "seed": 1}


def test_fallback_uses_last_json_block() -> None:
    out = 'noise\n{"metrics": {"a": 1}}\nmore noise\n{"metrics": {"a": 2}}\n'
    res = parse(out)
    assert res.parsed_via == "fallback"
    assert res.metrics == {"a": 2.0}


def test_no_match_returns_none_status() -> None:
    res = parse("just some plain text\n")
    assert res.parsed_via == "none"
    assert res.metrics == {}
