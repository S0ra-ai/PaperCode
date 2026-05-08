# SPDX-License-Identifier: MPL-2.0
"""ClarifyStage — entropy-driven, LLM-phrased clarification loop.

Replaces the M1 hard-coded 5-field walker. The orchestrator still
calls ``run(msg, answer=...)`` once per user input; the stage decides
whether to keep asking (and *what* to ask) or report ``complete``.

Stop logic lives in ``app.core.clarify.entropy``; question phrasing
lives in ``app.core.clarify.question``. Profile pre-fill happens in
``app.config.profile.merge_into_clarify`` and is applied here when
the payload has a ``"profile_prefill"`` flag set by the TUI.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.clarify import (
    ANSWERED_CONFIDENCE,
    DEFAULT_TAU_C,
    DEFAULT_TAU_E,
    DEFAULT_TAU_F,
    GeneratedQuestion,
    evaluate,
    generate,
    next_field,
)
from app.core.contract import StageMessage, StageRecord
from app.providers.registry import ProviderRegistry

STAGE = "clarify"

DEFAULT_MUST_HAVE: tuple[str, ...] = (
    "topic",
    "venue",
    "length_pages",
    "language",
    "author",
    "affiliation",
    "objective",
    "audience",
    "key_contributions",
)


def _confidences(payload: dict[str, object]) -> dict[str, float]:
    raw = payload.get("clarify_confidence")
    if isinstance(raw, dict):
        return {str(k): float(v) for k, v in raw.items()}
    return {}


def _seed_confidences(
    answers: dict[str, object],
    must_have: tuple[str, ...],
    existing: dict[str, float],
) -> dict[str, float]:
    """Ensure every must-have field is tracked, preserving prior confidence."""
    out = dict(existing)
    for f in must_have:
        if f not in out:
            out[f] = ANSWERED_CONFIDENCE if answers.get(f) else 0.0
    return out


def next_question(payload: dict[str, object]) -> tuple[str, str] | None:
    """Backward-compat shim used by older callers/tests.

    Looks at the payload's confidences (or seeds them from current
    answers + the default must-have set) and returns the next
    ``(field, fallback_question)`` to ask, or ``None`` if done.
    """
    answers = payload.get("clarify")
    if not isinstance(answers, dict):
        answers = {}
    confidences = _seed_confidences(answers, DEFAULT_MUST_HAVE, _confidences(payload))
    field = next_field(confidences, must_have=DEFAULT_MUST_HAVE)
    if field is None:
        return None
    from app.core.clarify.question import FALLBACK_QUESTIONS

    q = FALLBACK_QUESTIONS.get(field, (f"Please provide {field}.", "string"))[0]
    return field, q


async def run(
    msg: StageMessage,
    *,
    answer: tuple[str, str] | None = None,
    registry: ProviderRegistry | None = None,
    must_have: tuple[str, ...] = DEFAULT_MUST_HAVE,
    tau_e: float = DEFAULT_TAU_E,
    tau_f: float = DEFAULT_TAU_F,
    tau_c: float = DEFAULT_TAU_C,
) -> StageMessage:
    """Apply optional ``answer=(field, value)`` then report status."""
    started = datetime.now(UTC)
    new = msg.model_copy(deep=True)
    new.payload.setdefault("clarify", {})

    answers = new.payload["clarify"]
    if not isinstance(answers, dict):
        answers = {}
        new.payload["clarify"] = answers

    confidences = _seed_confidences(answers, must_have, _confidences(new.payload))

    if answer is not None:
        field, value = answer
        answers[field] = value
        confidences[field] = ANSWERED_CONFIDENCE

    new.payload["clarify_confidence"] = confidences

    decision = evaluate(
        confidences,
        must_have=must_have,
        tau_e=tau_e,
        tau_f=tau_f,
        tau_c=tau_c,
    )
    new.payload["clarify_metrics"] = {
        "entropy": decision.entropy,
        "coverage": decision.coverage,
        "weakest_field": decision.weakest_field,
        "weakest_confidence": decision.weakest_confidence,
        "reason": decision.reason,
    }

    if decision.should_stop:
        new.payload["clarify_status"] = "complete"
        new.payload.pop("clarify_pending", None)
        note = f"complete: H={decision.entropy:.2f} c={decision.coverage:.2f}"
    else:
        weakest = next_field(confidences, must_have=must_have)
        if weakest is None:
            new.payload["clarify_status"] = "complete"
            new.payload.pop("clarify_pending", None)
            note = "complete: no field to ask"
        else:
            generated: GeneratedQuestion = await generate(
                field=weakest,
                known=dict(answers),
                registry=registry,
            )
            new.payload["clarify_status"] = "need_input"
            new.payload["clarify_pending"] = {
                "field": generated.field,
                "question": generated.question,
                "expected_type": generated.expected_type,
                "source": generated.source,
                "description": generated.description,
                "options": [
                    {
                        "value": o.value,
                        "label": o.label,
                        "description": o.description,
                    }
                    for o in generated.options
                ],
                "allow_other": generated.allow_other,
            }
            note = f"need input: {generated.field} ({generated.source})"

    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=note,
    )
    return new.with_record(record)
