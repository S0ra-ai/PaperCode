# SPDX-License-Identifier: MPL-2.0
"""Provider performance history: track cost/latency per provider-model pair.

Detects anomalies (e.g., suddenly high token counts) and enables early
stopping or failover to cheaper providers.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median, stdev
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


@dataclass
class ProviderStats:
    """Aggregated stats for a provider."""

    provider_label: str
    model: str
    total_calls: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    avg_tokens_per_call: float = 0.0
    median_tokens: int = 0
    token_stdev: float = 0.0
    min_tokens: int = 0
    max_tokens: int = 0


async def compute_stats(
    provider_label: str,
    model: str,
    db_session: Session | None = None,
) -> ProviderStats | None:
    """Compute aggregate stats for a provider-model pair.

    Args:
        provider_label: Provider name (e.g., 'openai').
        model: Model identifier (e.g., 'gpt-4-turbo').
        db_session: SQLAlchemy session.

    Returns:
        ProviderStats or None if no history.
    """
    if db_session is None:
        return None

    from app.persistence.db import LLMCallRow

    calls = (
        db_session.query(LLMCallRow)
        .filter_by(provider_label=provider_label, model=model)
        .all()
    )

    if not calls:
        return None

    token_counts = [c.prompt_tokens + c.completion_tokens for c in calls]
    return ProviderStats(
        provider_label=provider_label,
        model=model,
        total_calls=len(calls),
        total_tokens=sum(token_counts),
        total_cost_usd=sum(c.cost_usd for c in calls),
        avg_tokens_per_call=sum(token_counts) / len(calls) if calls else 0.0,
        median_tokens=int(median(token_counts)) if token_counts else 0,
        token_stdev=stdev(token_counts) if len(token_counts) > 1 else 0.0,
        min_tokens=min(token_counts) if token_counts else 0,
        max_tokens=max(token_counts) if token_counts else 0,
    )


async def detect_anomaly(
    provider_label: str,
    model: str,
    new_tokens: int,
    threshold_sigma: float = 2.0,
    db_session: Session | None = None,
) -> tuple[bool, str]:
    """Detect if a call is anomalously expensive.

    Uses Mahalanobis distance: if new_tokens > mean + N*stdev, flag it.

    Args:
        provider_label: Provider.
        model: Model.
        new_tokens: Token count for this call.
        threshold_sigma: Z-score threshold (default 2.0 = ~95th percentile).
        db_session: SQLAlchemy session.

    Returns:
        (is_anomaly, reason) tuple.
    """
    stats = await compute_stats(provider_label, model, db_session)
    if stats is None or stats.total_calls < 5:
        # Need baseline
        return False, ""

    if stats.token_stdev == 0:
        # No variance yet
        return False, ""

    z_score = (new_tokens - stats.avg_tokens_per_call) / stats.token_stdev
    if z_score > threshold_sigma:
        return (
            True,
            f"Token count {new_tokens} is {z_score:.1f}x baseline std-dev above baseline",
        )

    return False, ""


async def should_early_stop(
    run_id: str,
    provider_label: str,
    model: str,
    cumulative_cost_usd: float,
    max_budget_usd: float,
    db_session: Session | None = None,
) -> tuple[bool, str]:
    """Check if cumulative cost exceeds a fraction of budget (early stop).

    Suggests stopping if cumulative cost > 80% of remaining budget.

    Args:
        run_id: Run ID (for logging).
        provider_label: Current provider.
        model: Current model.
        cumulative_cost_usd: Total cost so far.
        max_budget_usd: Total budget.
        db_session: SQLAlchemy session.

    Returns:
        (should_stop, reason) tuple.
    """
    if max_budget_usd == 0:
        return False, ""

    cost_fraction = cumulative_cost_usd / max_budget_usd
    if cost_fraction > 0.8:
        remaining = max_budget_usd - cumulative_cost_usd
        return (
            True,
            f"Cost {cost_fraction:.0%} of budget; ${remaining:.2f} remaining",
        )

    return False, ""
