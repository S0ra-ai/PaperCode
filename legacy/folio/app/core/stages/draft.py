# SPDX-License-Identifier: MPL-2.0
"""DraftStage — section-by-section drafting from outline + FormatSpec."""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.contract import StageMessage, StageRecord
from app.core.formats import FormatSpec
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry

STAGE = "draft"

DEFAULT_WORDS_PER_PAGE = 600


async def run(msg: StageMessage, *, registry: ProviderRegistry) -> StageMessage:
    started = datetime.now(UTC)
    spec = FormatSpec.model_validate(msg.payload["format_spec"])
    outline = msg.payload["outline"]
    clarify = msg.payload.get("clarify", {})
    topic = clarify.get("topic", "(unspecified)")
    length_pages = int(clarify.get("length_pages", 8) or 8)

    provider = first_provider(registry)
    sections_out: list[dict[str, object]] = []
    p_tokens = 0
    c_tokens = 0
    sections = outline.get("sections", [])
    if not sections:
        raise RuntimeError("DraftStage: outline has no sections")
    words_per_section = max(
        120, (length_pages * DEFAULT_WORDS_PER_PAGE) // len(sections)
    )

    for section in sections:
        prompt = render(
            "draft_section.j2",
            topic=topic,
            format_spec=spec,
            section=section,
            words_target=words_per_section,
            language=spec.language,
        )
        req = ChatRequest(
            messages=(ChatMessage(role="user", content=prompt),),
            model=provider.capability.default_model,
        )
        resp = await provider.chat(req)
        p_tokens += resp.prompt_tokens
        c_tokens += resp.completion_tokens
        sections_out.append({"name": section["name"], "text": resp.content.strip()})

    new = msg.model_copy(deep=True)
    new.payload["draft"] = {
        "title": outline.get("title", "Untitled"),
        "abstract_brief": outline.get("abstract_brief", ""),
        "keywords": outline.get("keywords", []),
        "sections": sections_out,
    }
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        provider_label=provider.label,
        model=provider.capability.default_model,
        prompt_tokens=p_tokens,
        completion_tokens=c_tokens,
        note=f"{len(sections_out)} sections drafted",
    )
    return new.with_record(record)
