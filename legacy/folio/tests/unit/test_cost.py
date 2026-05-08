# SPDX-License-Identifier: MPL-2.0
"""Cost meter + budget tests."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.providers.cost import (
    BudgetExceededError,
    CostMeter,
    assert_within_budget,
    get_meter,
    load_prices,
    reset_meter,
)


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_meter()


def test_record_aggregates_per_label() -> None:
    m = CostMeter(prices={"ds": {"*": 0.001}, "*": {"*": 0.0}})
    m.record(label="ds", model="m", prompt_tokens=1000, completion_tokens=2000)
    m.record(label="ds", model="m", prompt_tokens=500, completion_tokens=500)
    snap = {u.label: u for u in m.snapshot()}
    assert snap["ds"].prompt_tokens == 1500
    assert snap["ds"].completion_tokens == 2500
    # 1k+2k = 3k tokens * $0.001 + 1k tokens * $0.001 = $0.004
    assert abs(snap["ds"].cost_usd - 0.004) < 1e-9


def test_price_wildcards() -> None:
    m = CostMeter(prices={"ds": {"big": 0.05, "*": 0.001}})
    assert m.price_for("ds", "big") == 0.05
    assert m.price_for("ds", "small") == 0.001
    assert m.price_for("unknown", "x") == 0.0


def test_failure_increments_counter() -> None:
    m = CostMeter()
    m.record_failure("ds")
    m.record_failure("ds")
    snap = {u.label: u for u in m.snapshot()}
    assert snap["ds"].failures == 2


def test_load_prices_missing_file_returns_default(_isolate_folio_home: Path) -> None:
    p = load_prices()
    assert p == {"*": {"*": 0.0}}


def test_load_prices_reads_yaml(_isolate_folio_home: Path) -> None:
    (_isolate_folio_home / "prices.yml").write_text(
        "deepseek:\n  '*': 0.0014\n  reasoner: 0.014\n",
        encoding="utf-8",
    )
    p = load_prices()
    assert p["deepseek"]["reasoner"] == 0.014
    assert p["deepseek"]["*"] == 0.0014


def test_global_meter_persists_within_process(_isolate_folio_home: Path) -> None:
    get_meter().record(label="x", model="m", prompt_tokens=10, completion_tokens=20)
    assert get_meter().total_tokens() == 30


def test_budget_ceiling(
    _isolate_folio_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FOLIO_BUDGET_USD", "0.001")
    # explicit price so cost shows up
    (_isolate_folio_home / "prices.yml").write_text(
        "x:\n  '*': 0.01\n", encoding="utf-8"
    )
    get_meter()  # init with prices
    get_meter().record(label="x", model="m", prompt_tokens=200, completion_tokens=200)
    # 400 tokens * $0.01/1k = $0.004 > $0.001
    with pytest.raises(BudgetExceededError):
        assert_within_budget()


def test_no_ceiling_means_no_error(
    _isolate_folio_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.delenv("FOLIO_BUDGET_USD", raising=False)
    get_meter().record(label="x", model="m", prompt_tokens=99999, completion_tokens=0)
    assert_within_budget()  # no raise
