# SPDX-License-Identifier: MPL-2.0
"""End-to-end test for the M6 survey orchestrator.

Uses fake literature clients and a scripted ``_FakeProvider`` so no
network / LLM is touched. Exercises the full chain up through LaTeX
export; PDF and DOCX are skipped (they need tectonic / pandoc).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config.survey import SourcesToggle, SurveyConfig
from app.core.contract import Capability, StageMessage
from app.core.contract.survey_types import CorpusItem
from app.core.orchestrator import run_survey
from app.providers.base import ChatRequest, ChatResponse
from app.providers.registry import ProviderRegistry


class _FakeLitClient:
    def __init__(self, items: list[CorpusItem]) -> None:
        self._items = items

    async def search(self, query: str, *, limit: int) -> list[CorpusItem]:
        return list(self._items[:limit])

    async def aclose(self) -> None:
        return


class _FakeProvider:
    def __init__(self, responses: list[str]) -> None:
        self.label = "fake"
        self.capability = Capability(label="fake", base_url="x", default_model="m")
        self._responses = list(responses)

    async def chat(self, req: ChatRequest) -> ChatResponse:
        if not self._responses:
            raise AssertionError("FakeProvider ran out of scripted responses")
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


def _fake_registry() -> tuple[ProviderRegistry, _FakeProvider]:
    corpus_keys = [f"doi:10.1234/p{i}" for i in range(4)]
    taxonomy_resp = json.dumps(
        {
            "branches": [
                {
                    "id": "b1",
                    "title": "Attention-based Methods",
                    "description": "models leveraging attention",
                    "members": corpus_keys[:2],
                },
                {
                    "id": "b2",
                    "title": "Hybrid Architectures",
                    "description": "combining attention with convolutions",
                    "members": corpus_keys[2:],
                },
            ]
        }
    )
    outline_resp = json.dumps(
        {
            "title": "A Survey of Transformer Time Series Forecasting",
            "abstract_brief": "",
            "keywords": ["forecasting", "transformer"],
            "sections": [
                {"name": "Introduction", "bullets": ["motivation", "scope"]},
                {"name": "Background", "bullets": ["attention", "self-attention"]},
                {"name": "Attention-based Methods", "bullets": ["A", "B"]},
                {"name": "Hybrid Architectures", "bullets": ["C"]},
                {"name": "Comparative Analysis", "bullets": ["table"]},
                {"name": "Trends and Open Challenges", "bullets": ["T"]},
                {"name": "Conclusion", "bullets": ["wrap"]},
            ],
        }
    )
    # 7 sections x 1 response + 1 abstract = 8 drafting responses
    section_resp = lambda key: (  # noqa: E731
        f"Content body citing [CITE:{key}]. " + ("word " * 30)
    )
    responses = [
        taxonomy_resp,
        outline_resp,
        section_resp(corpus_keys[0]),  # Introduction
        section_resp(corpus_keys[1]),  # Background
        section_resp(corpus_keys[0]),  # Attention-based Methods
        section_resp(corpus_keys[2]),  # Hybrid Architectures
        section_resp(corpus_keys[1]),  # Comparative Analysis
        section_resp(corpus_keys[3]),  # Trends and Open Challenges
        section_resp(corpus_keys[2]),  # Conclusion
        f"Abstract citing [CITE:{corpus_keys[0]}].",  # abstract
    ]
    fp = _FakeProvider(responses)
    reg = ProviderRegistry()
    reg.register(fp)  # type: ignore[arg-type]
    return reg, fp


def _corpus_items() -> list[CorpusItem]:
    return [
        CorpusItem(
            key=f"tmp{i}",
            doi=f"10.1234/p{i}",
            title=f"Transformer Forecasting Paper {i}",
            authors=(f"Alice {i}", f"Bob {i}"),
            year=2020 + i,
            abstract="attention mechanism for forecasting",
            citation_count=10 * (i + 1),
        )
        for i in range(4)
    ]


@pytest.mark.asyncio
async def test_survey_e2e_produces_latex(tmp_path: Path) -> None:
    reg, _fp = _fake_registry()
    items = _corpus_items()
    s2 = _FakeLitClient(items)
    oa = _FakeLitClient(items)

    cfg = SurveyConfig(
        sources=SourcesToggle(
            arxiv=False,
            crossref=False,
            semantic_scholar=True,
            openalex=True,
            ieee_xplore=False,
            scholar_web=False,
        ),
        min_sources_required=2,
        corpus_size_target=4,
        pdf_on_demand_enabled=False,
        draft_section_retry_once=False,
    )

    msg = StageMessage(
        payload={
            "domain_inputs": {
                "domain": "transformer time series forecasting",
                "keywords": ("forecasting", "attention"),
                "length_words": 4000,
                "author": "Jane Doe",
            }
        }
    )

    # Monkey-patch the default client makers inside lit_search by injecting via kwargs:
    # we need to drive run_survey, but it calls lit_search with config only. Since
    # our config disables arxiv/crossref/ieee/scholar, only semantic_scholar &
    # openalex are invoked, and they need real instances. Swap by monkey-patching
    # the stage's module-level factories.
    from app.core.stages import literature_search as ls_mod

    original_s2 = ls_mod.SemanticScholarClient
    original_oa = ls_mod.OpenAlexClient
    ls_mod.SemanticScholarClient = lambda *a, **kw: s2  # type: ignore[assignment,misc]
    ls_mod.OpenAlexClient = lambda *a, **kw: oa  # type: ignore[assignment,misc]
    try:
        final = msg
        async for upd, _event in run_survey(
            msg,
            registry=reg,
            config=cfg,
            output_dir=tmp_path,
            skip_export_pdf=True,
            skip_export_docx=True,
        ):
            final = upd
    finally:
        ls_mod.SemanticScholarClient = original_s2  # type: ignore[assignment]
        ls_mod.OpenAlexClient = original_oa  # type: ignore[assignment]

    exports = final.payload.get("exports", {})
    tex_path = Path(exports["tex"])
    assert tex_path.exists()
    text = tex_path.read_text(encoding="utf-8")
    assert "Jane Doe" in text
    assert "\\cite{" in text

    citations = final.payload["citations"]
    assert citations
    assert all(c["source"] == "corpus" for c in citations)
    assert final.payload["verify_status"] == "ok"
