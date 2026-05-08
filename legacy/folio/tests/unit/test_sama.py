# SPDX-License-Identifier: MPL-2.0
"""SAMA router tests — pure scoring, no IO."""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.contract import Capability, CapFlag
from app.providers.sama import (
    DEFAULT_LAMBDA,
    DEFAULT_WEIGHTS,
    NoCandidatesError,
    ProviderQuote,
    Router,
    StageNotConfiguredError,
)


def _cap(
    label: str,
    *,
    flags: set[CapFlag] | None = None,
    ctx: int | None = None,
) -> Capability:
    return Capability(
        label=label,
        base_url="http://x",
        default_model="m",
        flags=frozenset(flags or set()),
        context_window=ctx,
        probed_at=datetime.now(UTC),
    )


def _q(label: str, *, flags=None, ctx=None, cost=0.0) -> ProviderQuote:  # type: ignore[no-untyped-def]
    return ProviderQuote(
        label=label,
        capability=_cap(label, flags=flags, ctx=ctx),
        cost_per_1k_tokens_usd=cost,
    )


def test_lambda_default_is_0_3() -> None:
    assert DEFAULT_LAMBDA == 0.3


def test_every_default_stage_has_5d_weights() -> None:
    for stage, w in DEFAULT_WEIGHTS.items():
        assert len(w) == 5, stage
        assert all(0.0 <= wi <= 1.0 for wi in w), stage


def test_route_picks_higher_score() -> None:
    r = Router()
    quotes = [
        _q("cheap_dumb", flags={CapFlag.CHAT}, ctx=4_000, cost=0.0),
        _q("rich_smart", flags={CapFlag.CHAT, CapFlag.STREAM}, ctx=128_000, cost=0.0),
    ]
    d = r.route("draft", quotes)
    assert d.label == "rich_smart"


def test_route_penalises_cost() -> None:
    r = Router()
    quotes = [
        _q("free", flags={CapFlag.CHAT, CapFlag.STREAM}, ctx=128_000, cost=0.0),
        _q("pricey", flags={CapFlag.CHAT, CapFlag.STREAM}, ctx=128_000, cost=0.10),
    ]
    d = r.route("draft", quotes)
    assert d.label == "free"


def test_exclude_skips_label() -> None:
    r = Router()
    quotes = [
        _q("a", flags={CapFlag.CHAT, CapFlag.STREAM}, ctx=128_000),
        _q("b", flags={CapFlag.CHAT}),
    ]
    d = r.route("draft", quotes, exclude=frozenset({"a"}))
    assert d.label == "b"


def test_unknown_stage_raises() -> None:
    r = Router()
    quotes = [_q("a", flags={CapFlag.CHAT})]
    try:
        r.route("nope", quotes)
    except StageNotConfiguredError:
        return
    raise AssertionError("expected StageNotConfiguredError")


def test_no_candidates_raises() -> None:
    r = Router()
    try:
        r.route("draft", [])
    except NoCandidatesError:
        return
    raise AssertionError("expected NoCandidatesError")


def test_rank_is_sorted_descending() -> None:
    r = Router()
    quotes = [
        _q("a", flags={CapFlag.CHAT}, cost=0.05),
        _q("b", flags={CapFlag.CHAT, CapFlag.STREAM}, cost=0.0),
        _q("c", flags={CapFlag.CHAT, CapFlag.STREAM}, ctx=128_000, cost=0.0),
    ]
    ranked = r.rank("draft", quotes)
    scores = [d.score for d in ranked]
    assert scores == sorted(scores, reverse=True)
    assert ranked[0].label == "c"
