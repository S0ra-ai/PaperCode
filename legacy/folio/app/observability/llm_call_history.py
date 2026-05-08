# SPDX-License-Identifier: MPL-2.0
"""LLM call history: complete request/response pairs for audit trail.

Stores full LLM conversation history (all request/response pairs) to DB,
enabling replay mode, better debugging, and cost/performance analytics.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


async def record_llm_call(
    run_id: str,
    stage_name: str,
    provider_label: str,
    model: str,
    request: dict[str, Any],
    response: dict[str, Any],
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    cost_usd: float = 0.0,
    latency_ms: int = 0,
    db_session: Session | None = None,
) -> None:
    """Record a complete LLM call to the audit trail.

    Args:
        run_id: Run ID (uuid string).
        stage_name: Stage that made the call.
        provider_label: Provider name ('openai', 'anthropic', etc.).
        model: Model identifier (e.g., 'gpt-4-turbo').
        request: Full request payload (messages, params, etc.).
        response: Full response payload (choices, usage, etc.).
        prompt_tokens: Input tokens used.
        completion_tokens: Output tokens used.
        cost_usd: Cost of this call.
        latency_ms: Latency in milliseconds.
        db_session: SQLAlchemy session (if provided, saves to DB).
    """
    if db_session is None:
        return

    from app.persistence.db import LLMCallRow

    row = LLMCallRow(
        run_id=run_id,
        stage_name=stage_name,
        provider_label=provider_label,
        model=model,
        request=request,
        response=response,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cost_usd=cost_usd,
        latency_ms=latency_ms,
        timestamp=datetime.now(UTC),
    )
    db_session.add(row)
    db_session.commit()


async def list_llm_calls(
    run_id: str,
    stage_name: str | None = None,
    db_session: Session | None = None,
) -> list[tuple[str, str, int, float]]:
    """List all LLM calls for a run.

    Returns list of (provider_label, model, total_tokens, total_cost) tuples.
    """
    if db_session is None:
        return []

    from app.persistence.db import LLMCallRow

    q = db_session.query(LLMCallRow).filter_by(run_id=run_id)
    if stage_name:
        q = q.filter_by(stage_name=stage_name)

    calls = q.all()
    result = []
    for call in calls:
        total_tokens = call.prompt_tokens + call.completion_tokens
        result.append((call.provider_label, call.model, total_tokens, call.cost_usd))
    return result


async def get_run_stats(
    run_id: str, db_session: Session | None = None
) -> dict[str, Any]:
    """Aggregate stats for entire run.

    Returns dict with total_calls, total_tokens, total_cost, by_stage breakdown.
    """
    if db_session is None:
        return {}

    from app.persistence.db import LLMCallRow

    calls = db_session.query(LLMCallRow).filter_by(run_id=run_id).all()

    total_calls = len(calls)
    total_prompt = sum(c.prompt_tokens for c in calls)
    total_completion = sum(c.completion_tokens for c in calls)
    total_cost = sum(c.cost_usd for c in calls)

    # By stage
    by_stage: dict[str, dict[str, int | float]] = {}
    for call in calls:
        stage = call.stage_name
        if stage not in by_stage:
            by_stage[stage] = {"calls": 0, "tokens": 0, "cost": 0.0}
        by_stage[stage]["calls"] += 1
        by_stage[stage]["tokens"] += call.prompt_tokens + call.completion_tokens
        by_stage[stage]["cost"] += call.cost_usd

    return {
        "total_calls": total_calls,
        "total_tokens": total_prompt + total_completion,
        "total_prompt_tokens": total_prompt,
        "total_completion_tokens": total_completion,
        "total_cost_usd": total_cost,
        "by_stage": by_stage,
    }


async def clear_run_calls(run_id: str, db_session: Session | None = None) -> int:
    """Clear all LLM calls for a run.

    Returns number of rows deleted.
    """
    if db_session is None:
        return 0

    from app.persistence.db import LLMCallRow

    count = db_session.query(LLMCallRow).filter_by(run_id=run_id).delete()
    db_session.commit()
    return count
