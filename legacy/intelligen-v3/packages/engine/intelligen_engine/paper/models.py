"""Shared models for the paper generation kernel."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Literal


class FormatSource(StrEnum):
    USER = "user"
    TASK_CONFIG = "task_config"
    GUIDELINE = "guideline"
    SAMPLE_PDF = "sample_pdf"
    DEFAULT = "default"


class FormatStrictness(StrEnum):
    STRICT = "strict"
    FLEXIBLE = "flexible"


@dataclass(frozen=True)
class FormatIntent:
    """User/task-level format requirement before it becomes a concrete spec."""

    venue_label: str | None = None
    variant: str | None = None
    source: FormatSource = FormatSource.USER
    strictness: FormatStrictness = FormatStrictness.STRICT
    conflict_policy: Literal["ask", "prefer_explicit", "prefer_sample"] = (
        "prefer_explicit"
    )

    @property
    def is_explicit(self) -> bool:
        return self.venue_label is not None and self.source in {
            FormatSource.USER,
            FormatSource.TASK_CONFIG,
            FormatSource.GUIDELINE,
        }


@dataclass(frozen=True)
class FormatSpec:
    venue_label: str
    display_name: str
    variant: str | None = None
    language: str = "en"
    page_size: Literal["A4", "Letter"] = "Letter"
    columns: int = 2
    citation_style: str = "numeric"
    bibliography_style: str = "IEEEtran"
    template_hint: str = "ieee.tex.j2"
    keywords_required: bool = True
    font_size_pt: int = 10
    paper: str = "letter"
    document_class_options: tuple[str, ...] = ("conference",)
    source: str = "builtin"

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class PaperSection:
    title: str
    paragraphs: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class PaperDraft:
    title: str
    abstract: str
    keywords: list[str]
    sections: list[PaperSection]
    authors: list[str] = field(default_factory=lambda: ["Anonymous"])
    bibliography: str = ""

    def to_dict(self) -> dict[str, object]:
        return asdict(self)
