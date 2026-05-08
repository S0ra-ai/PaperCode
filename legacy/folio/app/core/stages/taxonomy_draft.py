# SPDX-License-Identifier: MPL-2.0
"""TaxonomyDraftStage - LLM clusters the corpus into 3-7 branches.

Prompt consumes ``payload['corpus']`` title/abstract pairs. Output is
validated into a ``Taxonomy`` (``source="llm_draft"``). Members that
don't match a corpus key are dropped with a warning; empty branches
are filtered.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

from app.core.contract import StageMessage, StageRecord
from app.core.contract.survey_types import (
    CorpusItem,
    DomainSpec,
    Taxonomy,
    TaxonomyBranch,
)
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry

STAGE = "taxonomy_draft"


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


async def run(msg: StageMessage, *, registry: ProviderRegistry) -> StageMessage:
    started = datetime.now(UTC)
    domain = DomainSpec.model_validate(msg.payload["domain"])
    corpus = [CorpusItem.model_validate(c) for c in msg.payload["corpus"]]
    if not corpus:
        raise RuntimeError("TaxonomyDraftStage: corpus is empty")

    provider = first_provider(registry)
    prompt = render("taxonomy_draft.j2", domain=domain, corpus=corpus)
    req = ChatRequest(
        messages=(ChatMessage(role="user", content=prompt),),
        model=provider.capability.default_model,
        response_format={"type": "json_object"},
    )
    resp = await provider.chat(req)
    try:
        data = json.loads(_strip_code_fence(resp.content))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"TaxonomyDraftStage: LLM returned non-JSON: {exc}") from exc

    keys = {c.key for c in corpus}
    branches_out: list[TaxonomyBranch] = []
    for i, br in enumerate(data.get("branches", [])):
        members = tuple(k for k in br.get("members", []) if k in keys)
        if not members:
            continue
        branches_out.append(
            TaxonomyBranch(
                id=str(br.get("id") or f"b{i + 1}"),
                title=str(br.get("title") or f"Branch {i + 1}"),
                description=str(br.get("description") or ""),
                members=members,
            )
        )
    if not branches_out:
        raise RuntimeError("TaxonomyDraftStage: no branches survived member filtering")

    taxonomy = Taxonomy(branches=tuple(branches_out), source="llm_draft")

    new = msg.model_copy(deep=True)
    new.payload["taxonomy"] = taxonomy.model_dump()
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        provider_label=provider.label,
        model=resp.model,
        prompt_tokens=resp.prompt_tokens,
        completion_tokens=resp.completion_tokens,
        note=f"{len(branches_out)} branches",
    )
    return new.with_record(record)
