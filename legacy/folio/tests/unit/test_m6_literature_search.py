# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

import pytest

from app.config.survey import SourcesToggle, SurveyConfig
from app.core.contract import StageMessage
from app.core.contract.survey_types import CorpusItem
from app.core.stages import literature_search
from app.core.stages.literature_search import LiteratureSearchError


class _FakeClient:
    def __init__(self, items: list[CorpusItem]) -> None:
        self._items = items
        self.closed = False

    async def search(self, query: str, *, limit: int) -> list[CorpusItem]:
        return list(self._items[:limit])

    async def aclose(self) -> None:
        self.closed = True


def _seed_msg() -> StageMessage:
    return StageMessage(
        payload={
            "domain": {
                "domain": "transformers",
                "keywords": ("forecasting",),
                "language": "en",
            }
        }
    )


@pytest.mark.asyncio
async def test_literature_search_aggregates_enabled_sources() -> None:
    s2 = _FakeClient(
        [
            CorpusItem(key="s2_a", doi="10.1234/a", title="A", year=2022),
            CorpusItem(key="s2_b", doi="10.1234/b", title="B", year=2021),
        ]
    )
    oa = _FakeClient([CorpusItem(key="oa_a", doi="10.1234/a", title="A", year=2022)])
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
    )
    out = await literature_search.run(
        _seed_msg(),
        config=cfg,
        semantic_scholar=s2,
        openalex=oa,
    )
    raw = out.payload["lit_search_raw"]
    assert len(raw) == 3
    assert out.payload["lit_search_sources"] == {
        "semantic_scholar": 2,
        "openalex": 1,
    }


@pytest.mark.asyncio
async def test_literature_search_fails_when_too_few_sources() -> None:
    s2 = _FakeClient([])
    oa = _FakeClient([])
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
    )
    with pytest.raises(LiteratureSearchError):
        await literature_search.run(
            _seed_msg(), config=cfg, semantic_scholar=s2, openalex=oa
        )
