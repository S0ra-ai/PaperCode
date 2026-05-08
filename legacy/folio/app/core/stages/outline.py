# SPDX-License-Identifier: MPL-2.0
"""OutlineStage — generate a typed outline conditioned on FormatSpec + topic."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.core.contract import StageMessage, StageRecord
from app.core.formats import FormatSpec
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry

STAGE = "outline"


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


async def run(msg: StageMessage, *, registry: ProviderRegistry) -> StageMessage:
    started = datetime.now(UTC)
    spec = FormatSpec.model_validate(msg.payload["format_spec"])
    clarify = msg.payload.get("clarify", {})
    topic = clarify.get("topic", "(unspecified)")
    length_pages = int(clarify.get("length_pages", 8) or 8)

    provider = first_provider(registry)
    prompt = render(
        "outline.j2",
        topic=topic,
        format_spec=spec,
        length_pages=length_pages,
        language=spec.language,
    )
    req = ChatRequest(
        messages=(ChatMessage(role="user", content=prompt),),
        model=provider.capability.default_model,
        response_format={"type": "json_object"},
    )
    resp = await provider.chat(req)
    try:
        outline = json.loads(_strip_code_fence(resp.content))
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"OutlineStage: LLM did not return valid JSON: {exc}"
        ) from exc

    new = msg.model_copy(deep=True)
    new.payload["outline"] = outline
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        provider_label=provider.label,
        model=resp.model,
        prompt_tokens=resp.prompt_tokens,
        completion_tokens=resp.completion_tokens,
        note=f"{len(outline.get('sections', []))} sections",
    )
    return new.with_record(record)
