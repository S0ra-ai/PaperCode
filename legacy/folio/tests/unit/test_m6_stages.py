# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

import json

import pytest

from app.core.contract import Capability, StageMessage
from app.core.stages import (
    cite_bind,
    survey_draft,
    survey_outline,
    taxonomy_confirm,
    taxonomy_draft,
)
from app.providers.base import ChatRequest, ChatResponse
from app.providers.registry import ProviderRegistry


class _FakeProvider:
    def __init__(self, responses: list[str]) -> None:
        self.label = "fake"
        self.capability = Capability(label="fake", base_url="x", default_model="m")
        self._responses = list(responses)
        self.calls: list[ChatRequest] = []

    async def chat(self, req: ChatRequest) -> ChatResponse:
        self.calls.append(req)
        return ChatResponse(
            content=self._responses.pop(0),
            model=req.model,
            prompt_tokens=1,
            completion_tokens=1,
            raw={},
        )

    async def aclose(self) -> None: ...

    async def probe(self) -> Capability:  # pragma: no cover
        return self.capability


def _registry(p: _FakeProvider) -> ProviderRegistry:
    r = ProviderRegistry()
    r.register(p)  # type: ignore[arg-type]
    return r


def _corpus() -> list[dict]:
    return [
        {
            "key": f"doi:10.1234/p{i}",
            "doi": f"10.1234/p{i}",
            "title": f"Paper {i}",
            "authors": (f"Author{i} Lastname",),
            "year": 2020 + i,
            "abstract": f"abstract {i}",
            "relevance_score": 1.0 - i * 0.1,
        }
        for i in range(4)
    ]


@pytest.mark.asyncio
async def test_taxonomy_draft_filters_unknown_members() -> None:
    corpus = _corpus()
    resp = json.dumps(
        {
            "branches": [
                {
                    "id": "b1",
                    "title": "A",
                    "description": "a",
                    "members": [corpus[0]["key"], corpus[1]["key"], "ghost"],
                },
                {
                    "id": "b2",
                    "title": "B",
                    "description": "b",
                    "members": [corpus[2]["key"], corpus[3]["key"]],
                },
                {"id": "b3", "title": "Ghost-only", "members": ["ghost"]},
            ]
        }
    )
    fp = _FakeProvider([resp])
    msg = StageMessage(
        payload={"domain": {"domain": "x"}, "corpus": corpus},
    )
    out = await taxonomy_draft.run(msg, registry=_registry(fp))
    branches = out.payload["taxonomy"]["branches"]
    assert len(branches) == 2
    assert all("ghost" not in b["members"] for b in branches)
    assert out.payload["taxonomy"]["source"] == "llm_draft"


@pytest.mark.asyncio
async def test_taxonomy_confirm_auto_accept() -> None:
    msg = StageMessage(
        payload={
            "corpus": _corpus(),
            "taxonomy": {
                "branches": [{"id": "b1", "title": "A", "members": ["doi:10.1234/p0"]}],
                "source": "llm_draft",
            },
        }
    )
    out = await taxonomy_confirm.run(msg)
    assert out.payload["taxonomy"]["source"] == "auto_accept"


@pytest.mark.asyncio
async def test_taxonomy_confirm_applies_user_edits() -> None:
    corpus = _corpus()
    msg = StageMessage(
        payload={
            "corpus": corpus,
            "taxonomy": {
                "branches": [{"id": "b1", "title": "A", "members": [corpus[0]["key"]]}],
                "source": "llm_draft",
            },
            "taxonomy_edits": {
                "branches": [
                    {
                        "id": "x1",
                        "title": "Edited",
                        "members": [corpus[0]["key"], corpus[1]["key"], "ghost"],
                    }
                ]
            },
        }
    )
    out = await taxonomy_confirm.run(msg)
    assert out.payload["taxonomy"]["source"] == "user_edited"
    assert out.payload["taxonomy"]["branches"][0]["title"] == "Edited"
    assert "ghost" not in out.payload["taxonomy"]["branches"][0]["members"]


@pytest.mark.asyncio
async def test_survey_outline_merges_llm_bullets_into_fixed_skeleton() -> None:
    corpus = _corpus()
    taxonomy = {
        "branches": [
            {
                "id": "b1",
                "title": "Attention Models",
                "members": [corpus[0]["key"], corpus[1]["key"]],
            }
        ],
        "source": "auto_accept",
    }
    llm_resp = json.dumps(
        {
            "title": "A Survey of X",
            "abstract_brief": "brief",
            "keywords": ["a", "b"],
            "sections": [
                {"name": "Introduction", "bullets": ["motivate", "scope"]},
                {"name": "Attention Models", "bullets": ["alpha", "beta"]},
            ],
        }
    )
    fp = _FakeProvider([llm_resp])
    msg = StageMessage(
        payload={
            "domain": {"domain": "x"},
            "taxonomy": taxonomy,
            "budget": {"total_words": 15000},
            "corpus": corpus,
        }
    )
    out = await survey_outline.run(msg, registry=_registry(fp))
    names = [s["name"] for s in out.payload["outline"]["sections"]]
    assert "Introduction" in names
    assert "Attention Models" in names
    assert "Conclusion" in names
    intro = next(
        s for s in out.payload["outline"]["sections"] if s["name"] == "Introduction"
    )
    assert intro["bullets"] == ["motivate", "scope"]


@pytest.mark.asyncio
async def test_survey_draft_filters_unknown_citations_and_records_wordcount() -> None:
    from app.config.survey import SurveyConfig

    corpus = _corpus()
    outline = {
        "title": "T",
        "keywords": ["k"],
        "sections": [
            {"name": "Introduction", "target_words": 20, "bullets": ["b"]},
        ],
    }
    draft_resp = (
        "Known cite [CITE:" + corpus[0]["key"] + "]. "
        "Unknown cite [CITE:ghost] should be stripped. " + ("word " * 15)
    )
    abstract_resp = "Abstract text [CITE:" + corpus[1]["key"] + "]."
    fp = _FakeProvider([draft_resp, abstract_resp])
    msg = StageMessage(
        payload={
            "domain": {"domain": "x"},
            "outline": outline,
            "budget": {"total_words": 1000},
            "corpus": corpus,
        }
    )
    out = await survey_draft.run(
        msg,
        registry=_registry(fp),
        config=SurveyConfig(draft_section_retry_once=False),
    )
    section = out.payload["draft"]["sections"][0]
    assert "[CITE:ghost]" not in section["text"]
    assert f"[CITE:{corpus[0]['key']}]" in section["text"]
    assert section["word_count"] > 0
    assert "[CITE:" in out.payload["draft"]["abstract_brief"]


@pytest.mark.asyncio
async def test_cite_bind_replaces_placeholders_and_emits_bibtex() -> None:
    corpus = _corpus()
    draft = {
        "title": "T",
        "abstract_brief": f"See [CITE:{corpus[0]['key']}].",
        "keywords": ["k"],
        "sections": [
            {
                "name": "Introduction",
                "text": f"A [CITE:{corpus[0]['key']}] then B [CITE:{corpus[1]['key']}] plus [CITE:ghost].",
                "word_count": 10,
                "target_words": 10,
            }
        ],
    }
    msg = StageMessage(payload={"corpus": corpus, "draft": draft})
    out = await cite_bind.run(msg)
    bound = out.payload["draft"]["sections"][0]["text"]
    assert "[CITE:" not in bound
    assert "\\cite{" in bound
    assert out.payload["bibliography"].count("@") == 2
    assert all(c["source"] == "corpus" for c in out.payload["citations"])
