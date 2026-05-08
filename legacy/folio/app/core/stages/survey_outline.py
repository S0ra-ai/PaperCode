# SPDX-License-Identifier: MPL-2.0
"""SurveyOutlineStage - build the IEEE survey outline w/ word budget.

Sections (fixed for IEEE-style surveys):
1. Introduction
2. Background
3..N. Taxonomy branches (one section per branch, title = branch.title)
N+1. Comparative Analysis
N+2. Trends and Open Challenges
N+3. Conclusion

``payload['outline']`` is written in the same shape M1 uses so the
downstream export stages can consume it unchanged:
``{"title", "abstract_brief", "keywords", "sections": [{name, bullets,
target_words, members?}]}``.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.core.contract import StageMessage, StageRecord
from app.core.contract.survey_types import (
    CorpusItem,
    DomainSpec,
    SurveyBudget,
    Taxonomy,
)
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry

STAGE = "survey_outline"


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


def _section_plan(taxonomy: Taxonomy, budget: SurveyBudget) -> list[dict[str, object]]:
    per = budget.per_section_words
    tax_total = per.get("Taxonomy", 6000)
    n_branches = max(1, len(taxonomy.branches))
    per_branch = tax_total // n_branches

    sections: list[dict[str, object]] = [
        {"name": "Introduction", "target_words": per.get("Introduction", 1500)},
        {"name": "Background", "target_words": per.get("Background", 1500)},
    ]
    for branch in taxonomy.branches:
        sections.append(
            {
                "name": branch.title,
                "target_words": per_branch,
                "members": list(branch.members),
                "description": branch.description,
                "branch_id": branch.id,
            }
        )
    sections.append(
        {
            "name": "Comparative Analysis",
            "target_words": per.get("Comparative Analysis", 2000),
        }
    )
    sections.append(
        {
            "name": "Trends and Open Challenges",
            "target_words": per.get("Trends and Open Challenges", 2000),
        }
    )
    sections.append({"name": "Conclusion", "target_words": per.get("Conclusion", 750)})
    return sections


async def run(msg: StageMessage, *, registry: ProviderRegistry) -> StageMessage:
    started = datetime.now(UTC)
    domain = DomainSpec.model_validate(msg.payload["domain"])
    taxonomy = Taxonomy.model_validate(msg.payload["taxonomy"])
    budget = SurveyBudget.model_validate(msg.payload["budget"])
    corpus = [CorpusItem.model_validate(c) for c in msg.payload["corpus"]]

    sections = _section_plan(taxonomy, budget)

    provider = first_provider(registry)
    prompt = render(
        "survey_outline.j2",
        domain=domain,
        taxonomy=taxonomy,
        sections=sections,
        corpus=corpus,
        budget=budget,
    )
    req = ChatRequest(
        messages=(ChatMessage(role="user", content=prompt),),
        model=provider.capability.default_model,
        response_format={"type": "json_object"},
    )
    resp = await provider.chat(req)
    try:
        data = json.loads(_strip_code_fence(resp.content))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"SurveyOutlineStage: LLM returned non-JSON: {exc}") from exc

    # Merge LLM-produced bullets into the fixed section skeleton.
    llm_sections = {s.get("name"): s for s in data.get("sections", [])}
    merged_sections: list[dict[str, object]] = []
    for sec in sections:
        name = sec["name"]
        llm = llm_sections.get(name, {})
        merged_sections.append(
            {
                **sec,
                "bullets": list(llm.get("bullets", []))
                or [f"Cover {name!s} in the survey context."],
            }
        )

    outline = {
        "title": data.get("title") or f"A Survey of {domain.domain}",
        "abstract_brief": data.get("abstract_brief", ""),
        "keywords": data.get("keywords", list(domain.keywords)),
        "sections": merged_sections,
    }

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
        note=f"{len(merged_sections)} sections",
    )
    return new.with_record(record)
