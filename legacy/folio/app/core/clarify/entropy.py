# SPDX-License-Identifier: MPL-2.0
"""Entropy-based stop condition for ClarifyStage.

Each required field carries a confidence ``f ∈ [0, 1]``:
- 0.0 — unknown
- 0.4 — pre-filled from profile (plausible, not confirmed)
- 1.0 — explicitly answered by the user this run

We stop when:
- coverage ``c = mean(f) > τ_c``
- per-field ``f > tau_f`` for every must-have field
- normalized Shannon entropy of the (1-f) distribution ``H < tau_e``

Entropy on the *gap* (1-f) makes a clean signal: H is high when many
fields are still uncertain in similar amounts, low when uncertainty
collapses to one or zero fields.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

DEFAULT_TAU_E = 0.7
DEFAULT_TAU_F = 0.3
DEFAULT_TAU_C = 0.6

PROFILE_CONFIDENCE = 0.4
ANSWERED_CONFIDENCE = 1.0


@dataclass(frozen=True)
class StopDecision:
    should_stop: bool
    entropy: float
    coverage: float
    weakest_field: str | None
    weakest_confidence: float
    reason: str


def _normalized_entropy(gaps: list[float]) -> float:
    total = sum(gaps)
    if total <= 0.0:
        return 0.0
    probs = [g / total for g in gaps if g > 0]
    if len(probs) <= 1:
        return 0.0
    h = -sum(p * math.log(p) for p in probs)
    return h / math.log(len(probs))  # ∈ [0, 1]


def evaluate(
    confidences: dict[str, float],
    *,
    must_have: tuple[str, ...],
    tau_e: float = DEFAULT_TAU_E,
    tau_f: float = DEFAULT_TAU_F,
    tau_c: float = DEFAULT_TAU_C,
) -> StopDecision:
    """Decide whether the clarify loop can terminate."""
    if not confidences:
        return StopDecision(
            should_stop=False,
            entropy=1.0,
            coverage=0.0,
            weakest_field=None,
            weakest_confidence=0.0,
            reason="no fields tracked yet",
        )

    coverage = sum(confidences.values()) / len(confidences)
    gaps = [max(0.0, 1.0 - c) for c in confidences.values()]
    entropy = _normalized_entropy(gaps)

    weakest = min(confidences.items(), key=lambda kv: kv[1])
    weakest_field, weakest_conf = weakest

    if any(confidences.get(f, 0.0) < tau_f for f in must_have):
        missing = [f for f in must_have if confidences.get(f, 0.0) < tau_f]
        return StopDecision(
            should_stop=False,
            entropy=entropy,
            coverage=coverage,
            weakest_field=weakest_field,
            weakest_confidence=weakest_conf,
            reason=f"must-have below tau_f: {missing}",
        )

    if coverage <= tau_c:
        return StopDecision(
            should_stop=False,
            entropy=entropy,
            coverage=coverage,
            weakest_field=weakest_field,
            weakest_confidence=weakest_conf,
            reason=f"coverage {coverage:.2f} <= tau_c {tau_c}",
        )

    if entropy >= tau_e:
        return StopDecision(
            should_stop=False,
            entropy=entropy,
            coverage=coverage,
            weakest_field=weakest_field,
            weakest_confidence=weakest_conf,
            reason=f"entropy {entropy:.2f} >= tau_e {tau_e}",
        )

    return StopDecision(
        should_stop=True,
        entropy=entropy,
        coverage=coverage,
        weakest_field=weakest_field,
        weakest_confidence=weakest_conf,
        reason="coverage ok, entropy collapsed, must-haves satisfied",
    )


def next_field(
    confidences: dict[str, float],
    *,
    must_have: tuple[str, ...],
) -> str | None:
    """Pick the field most worth asking about next.

    Strategy: any must-have below ``tau_f`` first (lowest confidence wins),
    otherwise the globally lowest-confidence field, otherwise None.
    """
    if not confidences:
        return None
    must_pending = [(f, confidences.get(f, 0.0)) for f in must_have]
    must_pending.sort(key=lambda kv: kv[1])
    if must_pending and must_pending[0][1] < ANSWERED_CONFIDENCE:
        return must_pending[0][0]
    weakest = min(confidences.items(), key=lambda kv: kv[1])
    if weakest[1] >= ANSWERED_CONFIDENCE:
        return None
    return weakest[0]
