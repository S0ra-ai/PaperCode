# SPDX-License-Identifier: MPL-2.0
"""FormatSpec — the typed, machine-actionable description of a paper format.

Extracted by `FormatStage` from a sample PDF or built into the repo for
common venues. Consumed by `OutlineStage`, `DraftStage`, citation
formatting, and LaTeX templates.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field

SCHEMA_VERSION = 1


class CitationStyle(StrEnum):
    NUMERIC = "numeric"
    AUTHOR_YEAR = "author_year"
    SUPERSCRIPT = "superscript"
    GBT_7714 = "gbt_7714"  # CJC default


class PageSize(StrEnum):
    A4 = "A4"
    LETTER = "Letter"


class Margins(BaseModel):
    top_mm: float = 25.4
    bottom_mm: float = 25.4
    left_mm: float = 25.4
    right_mm: float = 25.4


class Font(BaseModel):
    body_family: str = "Times New Roman"
    body_size_pt: float = 10.0
    heading_family: str | None = None  # None → same as body
    monospace_family: str = "Courier New"


class FigureCaption(BaseModel):
    position: Literal["above", "below"] = "below"
    label_format: str = "Figure {n}: {caption}"


class FormatSpec(BaseModel):
    """Typed description of a paper format."""

    schema_version: int = SCHEMA_VERSION
    venue_label: str  # e.g. "IEEE", "ACM", "CJC", "Springer-LNCS", "custom-<sha>"
    display_name: str
    language: Literal["en", "zh", "auto"] = "en"
    page_size: PageSize = PageSize.A4
    columns: int = 1  # 1 or 2
    margins: Margins = Field(default_factory=Margins)
    font: Font = Field(default_factory=Font)
    citation_style: CitationStyle = CitationStyle.NUMERIC
    bibliography_style: str = "ieeetr"  # bst name / biblatex style hint
    section_order: tuple[str, ...] = (
        "Abstract",
        "Introduction",
        "Related Work",
        "Method",
        "Experiments",
        "Conclusion",
        "References",
    )
    figure_caption: FigureCaption = Field(default_factory=FigureCaption)
    abstract_max_words: int = 250
    keywords_required: bool = True
    template_hint: str = "_generic.tex.j2"  # name of jinja template to render
    extracted_at: datetime | None = None
    source: Literal["builtin", "venue", "custom"] = "builtin"
    prev_version: int | None = None  # rolling history (.vN.json)
    diff_from_prev: str | None = None

    model_config = {"frozen": False}
