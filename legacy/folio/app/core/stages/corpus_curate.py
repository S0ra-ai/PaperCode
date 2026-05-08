# SPDX-License-Identifier: MPL-2.0
"""CorpusCurateStage — dedupe, rank, truncate raw search results.

Scoring (all normalised to 0..1 before weighting):
* relevance ≈ overlap between query terms and (title + abstract)
* citations ≈ log1p(citation_count) normalised by max in the batch
* recency ≈ exp(-years_since_pub / 8)

The final ``payload['corpus']`` is at most ``corpus_size_target`` items,
all of which pass ``has_stable_id()`` when
``drop_items_without_stable_id=True`` (the default). Items lacking
an abstract are kept if they have a stable id — PdfOnDemandStage can
fetch text for them later.
"""

from __future__ import annotations

import math
import re
from datetime import UTC, datetime
from typing import Any

from app.config.survey import SurveyConfig
from app.core.contract import StageMessage, StageRecord
from app.core.contract.survey_types import CorpusItem, DomainSpec
from app.tools.literature.dedupe import dedupe_merge

STAGE = "corpus_curate"

_WORD = re.compile(r"[A-Za-z][A-Za-z0-9-]+")


def _tokenize(s: str) -> set[str]:
    return {m.group(0).lower() for m in _WORD.finditer(s or "")}


def _relevance(item: CorpusItem, query_tokens: set[str]) -> float:
    if not query_tokens:
        return 0.0
    bag = _tokenize(item.title) | _tokenize(item.abstract)
    if not bag:
        return 0.0
    overlap = len(query_tokens & bag)
    return overlap / len(query_tokens)


def _score(
    item: CorpusItem,
    *,
    query_tokens: set[str],
    max_cit_log: float,
    now_year: int,
    cfg: SurveyConfig,
) -> float:
    rel = _relevance(item, query_tokens)
    cit = 0.0
    if max_cit_log > 0:
        cit = math.log1p(item.citation_count) / max_cit_log
    rec = 0.0
    if item.year:
        years = max(0, now_year - item.year)
        rec = math.exp(-years / 8.0)
    w = cfg.ranking
    return w.relevance * rel + w.citations * cit + w.recency * rec


async def run(msg: StageMessage, *, config: SurveyConfig | None = None) -> StageMessage:
    started = datetime.now(UTC)
    cfg = config or SurveyConfig()
    domain = DomainSpec.model_validate(msg.payload["domain"])
    raw_items: list[dict[str, Any]] = msg.payload.get("lit_search_raw", [])
    items = [CorpusItem.model_validate(r) for r in raw_items]

    merged = dedupe_merge(items)
    if cfg.drop_items_without_stable_id:
        dropped = [i for i in merged if not i.has_stable_id()]
        merged = [i for i in merged if i.has_stable_id()]
    else:
        dropped = []

    # Window by time if DomainSpec supplies one.
    if domain.time_window:
        lo, hi = domain.time_window
        merged = [i for i in merged if i.year is None or lo <= i.year <= hi]

    query_tokens = _tokenize(domain.domain) | {*(k.lower() for k in domain.keywords)}
    max_cit_log = max((math.log1p(i.citation_count) for i in merged), default=0.0)
    now_year = datetime.now(UTC).year

    scored = sorted(
        (
            i.model_copy(
                update={
                    "relevance_score": _score(
                        i,
                        query_tokens=query_tokens,
                        max_cit_log=max_cit_log,
                        now_year=now_year,
                        cfg=cfg,
                    )
                }
            )
            for i in merged
        ),
        key=lambda i: i.relevance_score,
        reverse=True,
    )
    top = scored[: cfg.corpus_size_target]

    new = msg.model_copy(deep=True)
    new.payload["corpus"] = [i.model_dump() for i in top]
    new.payload["corpus_dropped_no_id"] = len(dropped)
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=(
            f"raw={len(items)} merged={len(merged)} kept={len(top)} "
            f"dropped_no_id={len(dropped)}"
        ),
    )
    return new.with_record(record)
