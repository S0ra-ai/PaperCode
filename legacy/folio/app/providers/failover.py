# SPDX-License-Identifier: MPL-2.0
"""Failover wrapper — tries SAMA-ranked providers in order on transient errors.

Wraps a `ProviderRegistry` + `Router` to pick the best provider for a
stage, then falls back to the next-ranked candidate on:

- ``httpx.TimeoutException``
- ``httpx.HTTPStatusError`` with 5xx status
- ``httpx.TransportError``

Each call records cost and (on failure) increments a per-label failure
counter. If the global budget ceiling is breached mid-call, raises
``BudgetExceededError`` *before* the next attempt.

Stages call this instead of touching the registry directly. The single
public entry point is `chat()`.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from app.observability.trace import TraceEvent
from app.observability.trace import write as write_trace
from app.providers.base import ChatRequest, ChatResponse, Provider
from app.providers.cost import (
    BudgetExceededError,
    assert_within_budget,
    get_meter,
)
from app.providers.registry import ProviderRegistry
from app.providers.sama import (
    NoCandidatesError,
    ProviderQuote,
    Router,
)

RETRYABLE_STATUS = frozenset({500, 502, 503, 504})


@dataclass(frozen=True)
class FailoverResult:
    response: ChatResponse
    label: str
    attempts: int
    fallbacks: tuple[str, ...]


class AllProvidersFailedError(RuntimeError):
    """Raised when every ranked provider returned a retryable error."""


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, httpx.TimeoutException | httpx.TransportError):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in RETRYABLE_STATUS
    return False


def _quote(provider: Provider, *, cost_per_1k: float = 0.0) -> ProviderQuote:
    return ProviderQuote(
        label=provider.label,
        capability=provider.capability,
        cost_per_1k_tokens_usd=cost_per_1k,
    )


async def chat(
    *,
    stage: str,
    request: ChatRequest,
    registry: ProviderRegistry,
    router: Router,
    run_id: str = "",
) -> FailoverResult:
    """Route ``request`` for ``stage``, falling back to next-ranked on 5xx/timeouts."""
    meter = get_meter()
    quotes = [
        _quote(p, cost_per_1k=meter.price_for(p.label, request.model or ""))
        for p in registry
    ]
    if not quotes:
        raise NoCandidatesError(stage)

    decisions = router.rank(stage, quotes)
    fallbacks: list[str] = []
    last_exc: BaseException | None = None

    for idx, decision in enumerate(decisions):
        assert_within_budget()
        provider = registry.get(decision.label)
        try:
            resp = await provider.chat(request)
            cost = meter.record(
                label=provider.label,
                model=resp.model,
                prompt_tokens=resp.prompt_tokens,
                completion_tokens=resp.completion_tokens,
            )
            write_trace(
                TraceEvent(
                    run_id=run_id or "anon",
                    stage=stage,
                    provider_label=provider.label,
                    model=resp.model,
                    prompt_tokens=resp.prompt_tokens,
                    completion_tokens=resp.completion_tokens,
                    cost_usd=cost,
                    note=(
                        "primary"
                        if idx == 0
                        else f"failover after {','.join(fallbacks)}"
                    ),
                )
            )
            return FailoverResult(
                response=resp,
                label=provider.label,
                attempts=idx + 1,
                fallbacks=tuple(fallbacks),
            )
        except BaseException as exc:
            if not _is_retryable(exc):
                raise
            meter.record_failure(provider.label)
            fallbacks.append(provider.label)
            last_exc = exc
            continue

    raise AllProvidersFailedError(
        f"stage={stage} exhausted {len(decisions)} providers; "
        f"last={type(last_exc).__name__ if last_exc else 'unknown'}"
    )


__all__ = [
    "AllProvidersFailedError",
    "BudgetExceededError",
    "FailoverResult",
    "chat",
]
