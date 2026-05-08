# SPDX-License-Identifier: MPL-2.0
"""Tests for the entropy-based clarify stop logic."""

from __future__ import annotations

import math

from app.core.clarify.entropy import (
    ANSWERED_CONFIDENCE,
    DEFAULT_TAU_C,
    DEFAULT_TAU_E,
    DEFAULT_TAU_F,
    evaluate,
    next_field,
)

MUST_HAVE = ("topic", "venue", "length_pages", "language", "author")


def test_empty_does_not_stop() -> None:
    d = evaluate({}, must_have=MUST_HAVE)
    assert not d.should_stop
    assert d.coverage == 0.0


def test_all_answered_stops() -> None:
    confs = {f: ANSWERED_CONFIDENCE for f in MUST_HAVE}
    d = evaluate(confs, must_have=MUST_HAVE)
    assert d.should_stop
    assert d.coverage == 1.0
    assert d.entropy == 0.0


def test_must_have_below_tau_blocks_stop() -> None:
    confs = {f: ANSWERED_CONFIDENCE for f in MUST_HAVE}
    confs["author"] = 0.1  # below default tau_f=0.3
    d = evaluate(confs, must_have=MUST_HAVE)
    assert not d.should_stop
    assert "must-have" in d.reason


def test_low_coverage_blocks_stop() -> None:
    confs = {f: 0.5 for f in MUST_HAVE}  # all above tau_f, coverage = 0.5 <= 0.6
    d = evaluate(confs, must_have=MUST_HAVE, tau_c=0.6)
    assert not d.should_stop
    assert "coverage" in d.reason


def test_high_entropy_blocks_stop() -> None:
    # All fields half-known → high entropy on the gap distribution
    confs = {f: 0.5 for f in MUST_HAVE}
    d = evaluate(confs, must_have=MUST_HAVE, tau_c=0.0, tau_f=0.0, tau_e=0.5)
    # uniform gaps → normalized entropy = 1.0
    assert math.isclose(d.entropy, 1.0, abs_tol=1e-9)
    assert not d.should_stop


def test_next_field_prefers_must_have() -> None:
    confs = {
        "topic": ANSWERED_CONFIDENCE,
        "venue": 0.0,
        "length_pages": 0.4,
        "language": 0.0,
        "author": ANSWERED_CONFIDENCE,
    }
    nxt = next_field(confs, must_have=MUST_HAVE)
    # venue and language tied at 0.0; sort puts venue first by stable order
    assert nxt in {"venue", "language"}


def test_next_field_returns_none_when_complete() -> None:
    confs = {f: ANSWERED_CONFIDENCE for f in MUST_HAVE}
    assert next_field(confs, must_have=MUST_HAVE) is None


def test_thresholds_have_expected_defaults() -> None:
    assert DEFAULT_TAU_E == 0.7
    assert DEFAULT_TAU_F == 0.3
    assert DEFAULT_TAU_C == 0.6
