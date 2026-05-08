# SPDX-License-Identifier: MPL-2.0
"""Unit tests for app.observability.pricing."""

from __future__ import annotations

from app.observability.pricing import (
    PRICE_TABLE,
    accumulate,
    estimate,
)


def test_estimate_known_model() -> None:
    p, c = PRICE_TABLE["deepseek-chat"]
    e = estimate(model="deepseek-chat", prompt_tokens=1000, completion_tokens=2000)
    assert e.usd == p * 1.0 + c * 2.0
    assert e.total_tokens == 3000
    assert e.cny > 0


def test_estimate_unknown_model_zero() -> None:
    e = estimate(model="totally-made-up", prompt_tokens=500, completion_tokens=500)
    assert e.usd == 0.0
    assert e.cny == 0.0
    assert e.total_tokens == 1000


def test_estimate_prefix_match() -> None:
    e = estimate(model="deepseek-foo-bar", prompt_tokens=1000, completion_tokens=0)
    # Falls back to deepseek- prefix entry.
    assert e.usd > 0


def test_estimate_none_model() -> None:
    e = estimate(model=None, prompt_tokens=10, completion_tokens=10)
    assert e.usd == 0.0


def test_accumulate_sums() -> None:
    a = estimate(model="deepseek-chat", prompt_tokens=100, completion_tokens=100)
    b = estimate(model="deepseek-chat", prompt_tokens=200, completion_tokens=200)
    total = accumulate([a, b])
    assert total.prompt_tokens == 300
    assert total.completion_tokens == 300
    assert abs(total.usd - (a.usd + b.usd)) < 1e-9


def test_accumulate_empty_returns_zero() -> None:
    total = accumulate([])
    assert total.prompt_tokens == 0
    assert total.usd == 0.0
