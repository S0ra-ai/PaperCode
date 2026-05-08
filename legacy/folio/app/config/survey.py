# SPDX-License-Identifier: MPL-2.0
"""Survey (M6) configuration.

Knobs for the ``survey_from_domain`` pipeline:

* which literature sources are enabled,
* ranking weights,
* corpus size / PDF-on-demand / word budget defaults,
* optional credentials (IEEE Xplore, Semantic Scholar).

Loaded lazily from ``FolioConfig`` (top-level ``survey:`` mapping) plus
``FOLIO_SURVEY_*`` env overrides. Safe defaults: ``scholar_web`` is
off; ``ieee_xplore`` is off unless a key is present.
"""

from __future__ import annotations

import os
from typing import Any

from pydantic import BaseModel, Field


class SourcesToggle(BaseModel):
    arxiv: bool = True
    crossref: bool = True
    semantic_scholar: bool = True
    openalex: bool = True
    ieee_xplore: bool = False
    scholar_web: bool = False


class RankingWeights(BaseModel):
    relevance: float = 0.5
    citations: float = 0.3
    recency: float = 0.2


class SurveyConfig(BaseModel):
    """Container for all M6 knobs."""

    sources: SourcesToggle = Field(default_factory=SourcesToggle)
    per_source_limit: int = 30
    per_source_timeout_s: float = 15.0
    min_sources_required: int = 2

    corpus_size_target: int = 80
    drop_items_without_stable_id: bool = True
    ranking: RankingWeights = Field(default_factory=RankingWeights)

    pdf_on_demand_top_k: int = 3
    pdf_on_demand_enabled: bool = True

    word_budget_total: int = 15000
    word_budget_tolerance: float = 0.15
    draft_section_retry_once: bool = True

    fact_verify_enabled: bool = False
    fact_verify_sample_per_branch: int = 3
    fact_verify_fail_ratio_max: float = 0.2

    semantic_scholar_api_key: str | None = None
    ieee_xplore_api_key: str | None = None


def _bool_env(name: str) -> bool | None:
    v = os.environ.get(name)
    if v is None:
        return None
    return v.lower() in ("1", "true", "yes", "on")


def load(raw: dict[str, Any] | None = None) -> SurveyConfig:
    """Resolve a ``SurveyConfig`` from optional raw mapping + env."""

    data: dict[str, Any] = dict(raw or {})

    # Env overrides for a few knobs that operators like to flip in CI.
    sources = dict(data.get("sources", {}))
    for src in (
        "arxiv",
        "crossref",
        "semantic_scholar",
        "openalex",
        "ieee_xplore",
        "scholar_web",
    ):
        v = _bool_env(f"FOLIO_SURVEY_SOURCE_{src.upper()}")
        if v is not None:
            sources[src] = v
    if sources:
        data["sources"] = sources

    # Credentials from env take precedence over config (avoids writing
    # keys into ``config.yml``).
    if (k := os.environ.get("FOLIO_SURVEY_SEMANTIC_SCHOLAR_API_KEY")) is not None:
        data["semantic_scholar_api_key"] = k
    if (k := os.environ.get("FOLIO_SURVEY_IEEE_XPLORE_API_KEY")) is not None:
        data["ieee_xplore_api_key"] = k
    # If ieee_xplore key is present we opt the source in by default.
    if data.get("ieee_xplore_api_key") and "ieee_xplore" not in data.get("sources", {}):
        data.setdefault("sources", {})["ieee_xplore"] = True

    return SurveyConfig.model_validate(data)


__all__ = ["RankingWeights", "SourcesToggle", "SurveyConfig", "load"]
