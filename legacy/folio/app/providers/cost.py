# SPDX-License-Identifier: MPL-2.0
"""Cost meter — per-endpoint token + dollar accounting.

A single in-process meter aggregates usage across the run; the TUI
top bar reads from it. Costs are derived from a static price table
(``$/1k tokens``) keyed by ``(provider_label, model)`` with sensible
defaults — users override via ``~/.folio/prices.yml``.

The meter is intentionally simple: no async, no DB, just a thread-safe
``Counter``-style accumulator. Persistence to trace happens via the
existing ``observability.trace`` writer.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock

import yaml

from app.config.loader import folio_home

PRICES_FILENAME = "prices.yml"

# Conservative defaults; overridden by ~/.folio/prices.yml.
# Keyed by ``label`` first, then ``model``. Wildcard ``"*"`` matches
# any model under that label.
DEFAULT_PRICES: dict[str, dict[str, float]] = {
    "*": {"*": 0.0},
}


@dataclass
class EndpointUsage:
    label: str
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    requests: int = 0
    failures: int = 0


@dataclass
class CostMeter:
    prices: dict[str, dict[str, float]] = field(
        default_factory=lambda: dict(DEFAULT_PRICES)
    )
    _by_label: dict[str, EndpointUsage] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock)

    def price_for(self, label: str, model: str) -> float:
        per_label = self.prices.get(label) or self.prices.get("*", {})
        if model in per_label:
            return float(per_label[model])
        if "*" in per_label:
            return float(per_label["*"])
        return 0.0

    def record(
        self,
        *,
        label: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> float:
        price = self.price_for(label, model)
        cost = (prompt_tokens + completion_tokens) / 1000.0 * price
        with self._lock:
            usage = self._by_label.setdefault(label, EndpointUsage(label=label))
            usage.prompt_tokens += prompt_tokens
            usage.completion_tokens += completion_tokens
            usage.cost_usd += cost
            usage.requests += 1
        return cost

    def record_failure(self, label: str) -> None:
        with self._lock:
            usage = self._by_label.setdefault(label, EndpointUsage(label=label))
            usage.failures += 1

    def snapshot(self) -> tuple[EndpointUsage, ...]:
        with self._lock:
            return tuple(
                EndpointUsage(
                    label=u.label,
                    prompt_tokens=u.prompt_tokens,
                    completion_tokens=u.completion_tokens,
                    cost_usd=u.cost_usd,
                    requests=u.requests,
                    failures=u.failures,
                )
                for u in self._by_label.values()
            )

    def total_usd(self) -> float:
        with self._lock:
            return sum(u.cost_usd for u in self._by_label.values())

    def total_tokens(self) -> int:
        with self._lock:
            return sum(
                u.prompt_tokens + u.completion_tokens for u in self._by_label.values()
            )

    def reset(self) -> None:
        with self._lock:
            self._by_label.clear()


def _prices_path() -> Path:
    return folio_home() / PRICES_FILENAME


def load_prices() -> dict[str, dict[str, float]]:
    """Load ``~/.folio/prices.yml`` if present, else return defaults."""
    path = _prices_path()
    if not path.exists():
        return dict(DEFAULT_PRICES)
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError(f"{PRICES_FILENAME} must be a mapping")
    out: dict[str, dict[str, float]] = {}
    for label, models in raw.items():
        if not isinstance(models, dict):
            raise ValueError(
                f"{PRICES_FILENAME}[{label}] must be a mapping of model -> price"
            )
        out[str(label)] = {str(m): float(p) for m, p in models.items()}
    return out


_global_meter: CostMeter | None = None
_global_lock = Lock()


class BudgetExceededError(RuntimeError):
    """Raised when the configured budget ceiling is hit."""


def get_meter() -> CostMeter:
    """Return the process-global meter, lazily constructed."""
    global _global_meter
    with _global_lock:
        if _global_meter is None:
            try:
                prices = load_prices()
            except Exception:
                prices = dict(DEFAULT_PRICES)
            _global_meter = CostMeter(prices=prices)
        return _global_meter


def reset_meter() -> None:
    """Reset the global meter (used by tests)."""
    global _global_meter
    with _global_lock:
        _global_meter = None


def budget_ceiling_usd() -> float | None:
    raw = os.environ.get("FOLIO_BUDGET_USD")
    if not raw:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def assert_within_budget() -> None:
    """Raise ``BudgetExceededError`` if the meter exceeds the env ceiling."""
    cap = budget_ceiling_usd()
    if cap is None:
        return
    if get_meter().total_usd() > cap:
        raise BudgetExceededError(
            f"budget ceiling ${cap:.4f} exceeded; total spent "
            f"${get_meter().total_usd():.4f}"
        )
