# SPDX-License-Identifier: MPL-2.0
"""DomainClarifyStage — collect the survey's scope from the user.

Unlike M1's ``ClarifyStage`` (which negotiates fields with the LLM),
the survey clarify is a fixed schema driven by the TUI/CLI. This stage
takes already-supplied answers on ``payload['domain_inputs']`` and
materialises a validated ``DomainSpec`` into ``payload['domain']``,
also setting ``payload['task_type'] = 'survey_from_domain'`` and a
default ``SurveyBudget`` if one is not already present.

No LLM call is made here; the stage only validates.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.contract import StageMessage, StageRecord
from app.core.contract.survey_types import DomainSpec, SurveyBudget

STAGE = "domain_clarify"


async def run(msg: StageMessage) -> StageMessage:
    started = datetime.now(UTC)
    inputs = msg.payload.get("domain_inputs")
    if inputs is None:
        raise RuntimeError(
            "DomainClarifyStage: payload['domain_inputs'] is required; "
            "populate it from the TUI/CLI before invoking the stage."
        )
    if not isinstance(inputs, dict):
        raise RuntimeError("DomainClarifyStage: domain_inputs must be a mapping")

    domain = DomainSpec.model_validate(inputs)

    new = msg.model_copy(deep=True)
    new.payload["task_type"] = "survey_from_domain"
    new.payload["domain"] = domain.model_dump()
    if "budget" not in new.payload:
        new.payload["budget"] = SurveyBudget(
            total_words=domain.length_words
        ).model_dump()

    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=f"domain={domain.domain!r} keywords={list(domain.keywords)}",
    )
    return new.with_record(record)
