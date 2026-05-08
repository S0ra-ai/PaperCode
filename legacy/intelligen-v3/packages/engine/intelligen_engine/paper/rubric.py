"""Content quality and word-progress audit for paper-mode drafts."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

from intelligen_engine.paper.models import PaperDraft


@dataclass(frozen=True)
class SectionProgress:
    title: str
    word_count: int
    target_words: int | None = None
    completion_pct: float | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class ContentRubricResult:
    passed: bool
    total_words: int
    target_words: int | None = None
    completion_pct: float | None = None
    missing_sections: list[str] = field(default_factory=list)
    section_progress: list[SectionProgress] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        data = asdict(self)
        data["section_progress"] = [item.to_dict() for item in self.section_progress]
        return data


_REQUIRED_SECTION_KEYWORDS = {
    "introduction": ("introduction", "引言"),
    "related_work": ("related", "literature", "相关"),
    "method": ("method", "approach", "方法", "模型"),
    "evaluation": ("evaluation", "experiment", "实验", "评测"),
    "discussion": ("discussion", "limitation", "讨论", "局限"),
    "conclusion": ("conclusion", "future", "结论", "未来"),
}


def audit_content_rubric(
    draft: PaperDraft,
    *,
    target_word_count: int | None = None,
) -> ContentRubricResult:
    section_titles = [section.title.lower() for section in draft.sections]
    missing_sections = [
        name
        for name, keywords in _REQUIRED_SECTION_KEYWORDS.items()
        if not any(any(keyword in title for keyword in keywords) for title in section_titles)
    ]

    total_words = _count_words(draft.title) + _count_words(draft.abstract)
    section_progress: list[SectionProgress] = []
    per_section_target = (
        max(target_word_count - _count_words(draft.abstract), 0) // len(draft.sections)
        if target_word_count and draft.sections
        else None
    )
    for section in draft.sections:
        words = sum(_count_words(paragraph) for paragraph in section.paragraphs)
        total_words += words
        completion = (
            round(min(words / per_section_target, 1.0) * 100, 1)
            if per_section_target
            else None
        )
        section_progress.append(
            SectionProgress(
                title=section.title,
                word_count=words,
                target_words=per_section_target,
                completion_pct=completion,
            )
        )

    completion_pct = (
        round(min(total_words / target_word_count, 1.0) * 100, 1)
        if target_word_count
        else None
    )
    warnings: list[str] = []
    if target_word_count and total_words < target_word_count:
        warnings.append("draft is below target word count and should continue through full drafting stages")

    return ContentRubricResult(
        passed=not missing_sections,
        total_words=total_words,
        target_words=target_word_count,
        completion_pct=completion_pct,
        missing_sections=missing_sections,
        section_progress=section_progress,
        warnings=warnings,
    )


def _count_words(text: str) -> int:
    return len(re.findall(r"[A-Za-z0-9]+|[\u4e00-\u9fff]", text or ""))
