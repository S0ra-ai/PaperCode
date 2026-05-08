# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

import pytest

from app.config.survey import SurveyConfig
from app.core.contract import StageMessage
from app.core.contract.survey_types import CorpusItem
from app.core.stages import corpus_curate


def _raw(items: list[CorpusItem]) -> list[dict]:
    return [i.model_dump() for i in items]


@pytest.mark.asyncio
async def test_corpus_curate_drops_items_without_stable_id() -> None:
    items = [
        CorpusItem(key="1", doi="10.1234/a", title="Transformers for forecasting"),
        CorpusItem(key="2", title="No id paper"),
    ]
    msg = StageMessage(
        payload={
            "domain": {"domain": "transformers", "keywords": ("forecasting",)},
            "lit_search_raw": _raw(items),
        }
    )
    out = await corpus_curate.run(msg)
    assert len(out.payload["corpus"]) == 1
    assert out.payload["corpus"][0]["doi"] == "10.1234/a"
    assert out.payload["corpus_dropped_no_id"] == 1


@pytest.mark.asyncio
async def test_corpus_curate_ranks_and_truncates() -> None:
    items = [
        CorpusItem(
            key=f"p{i}",
            doi=f"10.1234/p{i}",
            title=f"Transformers forecasting paper {i}",
            year=2020 + (i % 4),
            citation_count=i * 3,
            abstract="attention mechanism",
        )
        for i in range(10)
    ]
    msg = StageMessage(
        payload={
            "domain": {"domain": "transformers", "keywords": ("forecasting",)},
            "lit_search_raw": _raw(items),
        }
    )
    cfg = SurveyConfig(corpus_size_target=4)
    out = await corpus_curate.run(msg, config=cfg)
    assert len(out.payload["corpus"]) == 4
    scores = [c["relevance_score"] for c in out.payload["corpus"]]
    assert scores == sorted(scores, reverse=True)
