# SPDX-License-Identifier: MPL-2.0
"""Token → USD/CNY cost estimator for the live HUD.

A small built-in price table covers the vendors we actually exercise
(deepseek / openai / anthropic). Unknown models cost 0 — the HUD will
simply show 0.00 for them rather than crash. Update the table when a
new model becomes relevant; users who run boutique endpoints can patch
``PRICE_TABLE`` at import time.

All prices are USD per 1,000 tokens, split into prompt / completion.
The CNY conversion rate is configurable; default 7.20 mirrors the rate
used elsewhere in the project's docs.
"""

from __future__ import annotations

from dataclasses import dataclass

USD_PER_1K_PROMPT = "prompt"
USD_PER_1K_COMPLETION = "completion"

PRICE_TABLE: dict[str, tuple[float, float]] = {
    # deepseek (https://api-docs.deepseek.com/quick_start/pricing)
    "deepseek-chat": (0.00027, 0.0011),
    "deepseek-reasoner": (0.00055, 0.00219),
    # openai (representative; refresh when needed)
    "gpt-4o-mini": (0.00015, 0.0006),
    "gpt-4o": (0.0025, 0.01),
    "gpt-4.1-mini": (0.0004, 0.0016),
    "gpt-4.1": (0.002, 0.008),
    # anthropic
    "claude-3-5-haiku-latest": (0.0008, 0.004),
    "claude-3-5-sonnet-latest": (0.003, 0.015),
    "claude-sonnet-4": (0.003, 0.015),
    # generic fallbacks by family prefix (best-effort)
    "deepseek-": (0.00027, 0.0011),
    "gpt-4": (0.0025, 0.01),
    "claude-": (0.003, 0.015),
}

DEFAULT_CNY_PER_USD = 7.20


@dataclass(frozen=True)
class CostEstimate:
    prompt_tokens: int
    completion_tokens: int
    usd: float
    cny: float

    @property
    def total_tokens(self) -> int:
        return self.prompt_tokens + self.completion_tokens


def _lookup(model: str | None) -> tuple[float, float]:
    if not model:
        return (0.0, 0.0)
    if model in PRICE_TABLE:
        return PRICE_TABLE[model]
    # prefix match
    for key, val in PRICE_TABLE.items():
        if key.endswith("-") and model.startswith(key):
            return val
    return (0.0, 0.0)


def estimate(
    *,
    model: str | None,
    prompt_tokens: int,
    completion_tokens: int,
    cny_per_usd: float = DEFAULT_CNY_PER_USD,
) -> CostEstimate:
    """Return a CostEstimate for a single LLM call."""
    p_per_1k, c_per_1k = _lookup(model)
    usd = (prompt_tokens / 1000.0) * p_per_1k + (completion_tokens / 1000.0) * c_per_1k
    return CostEstimate(
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        usd=usd,
        cny=usd * cny_per_usd,
    )


def accumulate(estimates: list[CostEstimate]) -> CostEstimate:
    """Combine several CostEstimates into a running total."""
    p = sum(e.prompt_tokens for e in estimates)
    c = sum(e.completion_tokens for e in estimates)
    usd = sum(e.usd for e in estimates)
    cny = sum(e.cny for e in estimates)
    return CostEstimate(prompt_tokens=p, completion_tokens=c, usd=usd, cny=cny)
