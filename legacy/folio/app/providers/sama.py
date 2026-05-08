# SPDX-License-Identifier: MPL-2.0
"""Stage-Aware Model Assignment (SAMA).

Each registered provider has a `Capability` (probed at startup). For
each Folio stage we maintain a 5-d preference vector over the same
axes; routing picks the provider that maximises::

    score(p) = w_stage · v(p) - lambda * cost(p)

where:
- ``v(p)`` is the provider's capability score on each axis (∈ [0, 1])
- ``w_stage`` is the per-stage weight vector (also ∈ [0, 1], sum-1
  is *not* required — magnitudes encode emphasis)
- ``cost(p)`` is the per-token cost in $/1k tokens (scaled to [0, 1]
  by ``MAX_COST_USD``)
- ``lambda`` is the cost penalty (default 0.3)

This module is **pure** — no IO, no LLM call, no provider mutation.
Construct a `Router` once at startup, call `route(stage, candidates)`
to get the best label.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.core.contract import Capability, CapFlag

AXES: tuple[str, ...] = ("chat", "code", "long_ctx", "speed", "cost")

# Default per-stage weight vectors. Every stage must have an entry.
# Magnitudes are subjective — tune from observed behaviour, don't fight
# them. The "cost" axis is handled separately via ``lambda * cost(p)``,
# so its weight here is always 0.
DEFAULT_WEIGHTS: dict[str, tuple[float, float, float, float, float]] = {
    "format": (0.7, 0.4, 0.9, 0.4, 0.0),
    "clarify": (0.9, 0.2, 0.4, 0.8, 0.0),
    "outline": (0.9, 0.3, 0.7, 0.5, 0.0),
    "draft": (0.9, 0.4, 0.9, 0.3, 0.0),
    "cite_fetch": (0.6, 0.3, 0.5, 0.7, 0.0),
    "verify_refs": (0.6, 0.2, 0.4, 0.7, 0.0),
    "code": (0.5, 0.95, 0.7, 0.5, 0.0),
    "experiment_write": (0.9, 0.5, 0.8, 0.3, 0.0),
    "fact_verify": (0.8, 0.3, 0.7, 0.6, 0.0),
}

DEFAULT_LAMBDA = 0.3
MAX_COST_USD = 0.10  # treat $0.10/1k tokens as the "expensive" anchor


@dataclass(frozen=True)
class ProviderQuote:
    """What SAMA needs to know about one configured provider."""

    label: str
    capability: Capability
    cost_per_1k_tokens_usd: float = 0.0
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class RouteDecision:
    label: str
    score: float
    breakdown: dict[str, float]


def _axis_scores(cap: Capability) -> tuple[float, float, float, float, float]:
    """Map a Capability into a 5-d feature vector ∈ [0, 1]."""
    chat = 1.0 if cap.supports(CapFlag.CHAT) else 0.0
    code = 0.8 if cap.supports(CapFlag.TOOLS) else 0.5
    ctx = cap.context_window or 0
    long_ctx = min(1.0, ctx / 128_000) if ctx else 0.5
    # Streaming ≈ low first-token latency; treat as proxy for speed
    speed = 0.8 if cap.supports(CapFlag.STREAM) else 0.4
    cost_axis = 0.0  # handled separately via lambda
    return (chat, code, long_ctx, speed, cost_axis)


class StageNotConfiguredError(KeyError):
    """Raised when a stage has no weights and no override is given."""


class NoCandidatesError(RuntimeError):
    """Raised when route() is called with an empty candidate set."""


@dataclass(frozen=True)
class Router:
    weights: dict[str, tuple[float, float, float, float, float]] = field(
        default_factory=lambda: dict(DEFAULT_WEIGHTS)
    )
    lambda_cost: float = DEFAULT_LAMBDA

    def score(self, stage: str, quote: ProviderQuote) -> RouteDecision:
        try:
            w = self.weights[stage]
        except KeyError as exc:
            raise StageNotConfiguredError(stage) from exc
        v = _axis_scores(quote.capability)
        dot = sum(wi * vi for wi, vi in zip(w, v, strict=True))
        cost_norm = min(1.0, max(0.0, quote.cost_per_1k_tokens_usd / MAX_COST_USD))
        cost_term = self.lambda_cost * cost_norm
        total = dot - cost_term
        return RouteDecision(
            label=quote.label,
            score=total,
            breakdown={
                "dot": dot,
                "cost_norm": cost_norm,
                "cost_term": cost_term,
                **dict(zip(AXES, v, strict=True)),
            },
        )

    def route(
        self,
        stage: str,
        candidates: list[ProviderQuote],
        *,
        exclude: frozenset[str] = frozenset(),
    ) -> RouteDecision:
        usable = [q for q in candidates if q.label not in exclude]
        if not usable:
            raise NoCandidatesError(stage)
        scored = [self.score(stage, q) for q in usable]
        scored.sort(key=lambda d: (-d.score, d.label))
        return scored[0]

    def rank(
        self,
        stage: str,
        candidates: list[ProviderQuote],
        *,
        exclude: frozenset[str] = frozenset(),
    ) -> list[RouteDecision]:
        usable = [q for q in candidates if q.label not in exclude]
        scored = [self.score(stage, q) for q in usable]
        scored.sort(key=lambda d: (-d.score, d.label))
        return scored
