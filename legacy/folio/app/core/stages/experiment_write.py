# SPDX-License-Identifier: MPL-2.0
"""ExperimentWriteStage — turn measured metrics into the §Experiments prose.

Runs only when ``payload["experiment"]["status"] == "ok"``. Writes the
section back into ``payload["draft"]["sections"]`` (replacing the
placeholder draft for the experiments section).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.core.contract import StageMessage, StageRecord
from app.core.formats import FormatSpec
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry

STAGE = "experiment_write"

DEFAULT_WORDS = 350


def _find_section(
    sections: list[dict[str, Any]], name: str
) -> tuple[int, dict[str, Any]] | None:
    for i, sec in enumerate(sections):
        if sec.get("name") == name:
            return i, sec
    return None


async def run(msg: StageMessage, *, registry: ProviderRegistry) -> StageMessage:
    started = datetime.now(UTC)
    exp = msg.payload.get("experiment")
    if not exp or exp.get("status") != "ok":
        record = StageRecord(
            stage=STAGE,
            started_at=started,
            finished_at=datetime.now(UTC),
            note=(
                "no experiment payload"
                if not exp
                else f"skipped: status={exp.get('status')}"
            ),
        )
        return msg.with_record(record)

    spec = FormatSpec.model_validate(msg.payload["format_spec"])
    clarify = msg.payload.get("clarify", {})
    draft = msg.payload.get("draft", {})
    sections: list[dict[str, Any]] = list(draft.get("sections", []))

    section_name = exp.get("section_name")
    found = _find_section(sections, section_name) if section_name else None
    outline_section = next(
        (
            s
            for s in msg.payload.get("outline", {}).get("sections", [])
            if s.get("name") == section_name
        ),
        {"name": section_name or "Experiments", "brief": ""},
    )

    metrics = exp["result"].get("metrics", {})
    extra = exp["result"].get("extra", {})

    provider = first_provider(registry)
    prompt = render(
        "experiment_write.j2",
        topic=clarify.get("topic", "(unspecified)"),
        section=outline_section,
        words_target=DEFAULT_WORDS,
        metrics=metrics,
        extra=extra,
        language=spec.language,
    )
    resp = await provider.chat(
        ChatRequest(
            messages=(ChatMessage(role="user", content=prompt),),
            model=provider.capability.default_model,
        )
    )
    prose = resp.content.strip()

    if found is None:
        sections.append({"name": section_name or "Experiments", "text": prose})
    else:
        idx, sec = found
        sections[idx] = {**sec, "text": prose}

    new = msg.model_copy(deep=True)
    new.payload["draft"] = {**draft, "sections": sections}
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        provider_label=provider.label,
        model=provider.capability.default_model,
        prompt_tokens=resp.prompt_tokens,
        completion_tokens=resp.completion_tokens,
        note=f"wrote experiments prose ({len(metrics)} metric(s))",
    )
    return new.with_record(record)
