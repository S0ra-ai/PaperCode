# SPDX-License-Identifier: MPL-2.0
"""SurveyDraftStage — section-by-section drafting constrained to corpus.

Each section:
* gets ``target_words`` from outline,
* receives a focused corpus slice (taxonomy branch members when the
  section corresponds to one; top-K relevant items otherwise),
* must cite corpus items via ``[CITE:<corpus_key>]`` — any unknown
  placeholders are stripped post-hoc.

One retry per section if the output word count lies outside
``±cfg.word_budget_tolerance`` of ``target_words`` (configurable).
Abstract is drafted last, fed the already-written sections.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from typing import Any

from app.config.survey import SurveyConfig
from app.core.contract import StageMessage, StageRecord
from app.core.contract.survey_types import CorpusItem, DomainSpec, SurveyBudget
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry

log = logging.getLogger(__name__)

STAGE = "survey_draft"

_PLACEHOLDER = re.compile(r"\[CITE:([^\]]+)\]")


def _word_count(text: str) -> int:
    return len([w for w in text.split() if w.strip()])


def _filter_citations(text: str, allowed_keys: set[str]) -> str:
    """Remove [CITE:x] whose ``x`` is not in ``allowed_keys``."""

    def _sub(m: re.Match[str]) -> str:
        return m.group(0) if m.group(1).strip() in allowed_keys else ""

    return _PLACEHOLDER.sub(_sub, text)


def _slice_for_section(
    section: dict[str, object], corpus: list[CorpusItem], cap: int = 30
) -> list[CorpusItem]:
    members = section.get("members")
    if isinstance(members, list) and members:
        keys = set(members)
        return [c for c in corpus if c.key in keys][:cap]
    # Generic section: top-K by relevance.
    ordered = sorted(corpus, key=lambda i: i.relevance_score, reverse=True)
    return ordered[:cap]


async def run(
    msg: StageMessage,
    *,
    registry: ProviderRegistry,
    config: SurveyConfig | None = None,
) -> StageMessage:
    started = datetime.now(UTC)
    cfg = config or SurveyConfig()
    domain = DomainSpec.model_validate(msg.payload["domain"])
    outline = msg.payload["outline"]
    budget = SurveyBudget.model_validate(msg.payload["budget"])
    corpus = [CorpusItem.model_validate(c) for c in msg.payload["corpus"]]
    allowed_keys = {c.key for c in corpus}

    provider = first_provider(registry)
    sections_out: list[dict[str, Any]] = []
    p_tokens = 0
    c_tokens = 0
    tolerance = cfg.word_budget_tolerance

    for section in outline["sections"]:
        target_words = int(section.get("target_words") or 800)
        slice_ = _slice_for_section(section, corpus)

        async def _draft_once(
            extra_note: str = "",
            *,
            section: dict[str, Any] = section,
            slice_: list[CorpusItem] = slice_,
            target_words: int = target_words,
        ) -> tuple[str, int, int]:
            prompt = render(
                "survey_draft_section.j2",
                domain=domain,
                section=section,
                corpus_slice=slice_,
                target_words=target_words,
                extra_note=extra_note,
            )
            req = ChatRequest(
                messages=(ChatMessage(role="user", content=prompt),),
                model=provider.capability.default_model,
            )
            r = await provider.chat(req)
            return r.content.strip(), r.prompt_tokens, r.completion_tokens

        text, pt, ct = await _draft_once()
        p_tokens += pt
        c_tokens += ct
        wc = _word_count(text)
        low = int(target_words * (1 - tolerance))
        high = int(target_words * (1 + tolerance))
        if cfg.draft_section_retry_once and (wc < low or wc > high):
            direction = "expand" if wc < low else "tighten"
            log.info(
                "survey_draft: %s word count %d vs target %d; retrying to %s",
                section.get("name"),
                wc,
                target_words,
                direction,
            )
            text2, pt2, ct2 = await _draft_once(
                extra_note=f"Previous attempt was {wc} words; {direction} to ~{target_words}."
            )
            p_tokens += pt2
            c_tokens += ct2
            # Keep whichever is closer to target.
            if abs(_word_count(text2) - target_words) < abs(wc - target_words):
                text = text2
                wc = _word_count(text2)

        text = _filter_citations(text, allowed_keys)
        sections_out.append(
            {
                "name": section["name"],
                "text": text,
                "word_count": wc,
                "target_words": target_words,
            }
        )

    # Abstract
    abstract_target = budget.per_section_words.get("Abstract", 250)
    prompt = render(
        "survey_draft_abstract.j2",
        domain=domain,
        sections=sections_out,
        target_words=abstract_target,
    )
    req = ChatRequest(
        messages=(ChatMessage(role="user", content=prompt),),
        model=provider.capability.default_model,
    )
    resp = await provider.chat(req)
    p_tokens += resp.prompt_tokens
    c_tokens += resp.completion_tokens
    abstract_text = _filter_citations(resp.content.strip(), allowed_keys)

    draft = {
        "title": outline.get("title", f"A Survey of {domain.domain}"),
        "abstract_brief": abstract_text,
        "keywords": outline.get("keywords", list(domain.keywords)),
        "sections": sections_out,
    }

    new = msg.model_copy(deep=True)
    new.payload["draft"] = draft
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        provider_label=provider.label,
        model=provider.capability.default_model,
        prompt_tokens=p_tokens,
        completion_tokens=c_tokens,
        note=(
            f"{len(sections_out)} sections drafted; "
            f"total_words={sum(int(s.get('word_count', 0) or 0) for s in sections_out)}"
        ),
    )
    return new.with_record(record)
