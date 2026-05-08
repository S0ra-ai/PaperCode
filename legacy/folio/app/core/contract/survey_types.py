# SPDX-License-Identifier: MPL-2.0
"""M6 survey types: domain spec, corpus item, taxonomy, budget.

These are carried inside ``StageMessage.payload`` under well-known keys
(``domain``, ``corpus``, ``taxonomy``, ``budget``). Each model carries a
``schema_version`` so future upgrades can detect stale payloads.

Nothing here does IO; pure pydantic.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

SCHEMA_VERSION = 1


class DomainSpec(BaseModel):
    """User-supplied description of the survey target domain."""

    schema_version: int = SCHEMA_VERSION
    domain: str
    keywords: tuple[str, ...] = ()
    time_window: tuple[int, int] | None = None
    language: Literal["en"] = "en"  # IEEE survey locked to English
    sub_areas_hint: tuple[str, ...] = ()
    length_words: int = 15000
    author: str = "Anonymous"
    ieee_variant: Literal["journal", "conference"] = "journal"


class CorpusItem(BaseModel):
    """A single candidate piece of literature discovered by search."""

    schema_version: int = SCHEMA_VERSION
    key: str  # dedupe key (doi or arxiv id or canonical)
    doi: str | None = None
    arxiv_id: str | None = None
    title: str
    authors: tuple[str, ...] = ()
    year: int | None = None
    venue: str | None = None
    abstract: str = ""
    url: str | None = None
    pdf_url: str | None = None
    citation_count: int = 0
    source_hits: tuple[str, ...] = ()
    relevance_score: float = 0.0
    cluster_id: str | None = None
    full_text: str | None = None
    full_text_source: Literal["arxiv", "openalex", "unpaywall", "none"] = "none"

    def has_stable_id(self) -> bool:
        return bool(self.doi or self.arxiv_id)


class TaxonomyBranch(BaseModel):
    """A single taxonomy branch = a §section of the survey body."""

    id: str
    title: str
    description: str = ""
    members: tuple[str, ...] = ()  # corpus keys


class Taxonomy(BaseModel):
    """Tree-of-one-level taxonomy over the corpus."""

    schema_version: int = SCHEMA_VERSION
    branches: tuple[TaxonomyBranch, ...] = ()
    source: Literal["llm_draft", "user_edited", "auto_accept"] = "llm_draft"


class SurveyBudget(BaseModel):
    """Per-section word targets. Default is a balanced IEEE survey split.

    Sum of ``per_section_words`` should be approximately ``total_words``;
    the orchestrator uses it as the draft-stage target.
    """

    schema_version: int = SCHEMA_VERSION
    total_words: int = 15000
    per_section_words: dict[str, int] = Field(
        default_factory=lambda: {
            "Abstract": 250,
            "Introduction": 1500,
            "Background": 1500,
            "Taxonomy": 6000,
            "Comparative Analysis": 2000,
            "Trends and Open Challenges": 2000,
            "Conclusion": 750,
        }
    )


__all__ = [
    "SCHEMA_VERSION",
    "CorpusItem",
    "DomainSpec",
    "SurveyBudget",
    "Taxonomy",
    "TaxonomyBranch",
]
