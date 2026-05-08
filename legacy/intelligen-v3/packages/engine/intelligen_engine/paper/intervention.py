"""Plan scoped user interventions for paper-mode drafts."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from intelligen_engine.paper.models import PaperDraft, PaperSection


@dataclass(frozen=True)
class InterventionPlan:
    target_sections: list[str]
    action_plan: list[str]
    required_audits: list[str]
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


_SECTION_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("abstract", ("摘要", "abstract")),
    ("introduction", ("引言", "introduction", "intro", "背景")),
    ("related_work", ("相关工作", "related", "literature", "文献")),
    ("method", ("方法", "method", "approach", "算法", "模型")),
    ("experiment", ("实验", "experiment", "evaluation", "评测", "结果")),
    ("discussion", ("讨论", "discussion", "局限", "limitation")),
    ("conclusion", ("结论", "conclusion", "future work", "未来")),
    ("references", ("引用", "参考文献", "reference", "citation", "bibtex")),
    ("format", ("格式", "版式", "ieee", "latex", "模板")),
)


def plan_intervention(message: str, available_sections: list[str] | None = None) -> InterventionPlan:
    """Create a deterministic impact plan before mutating a generated paper."""
    normalized = message.strip().lower()
    sections = _detect_sections(normalized)
    if not sections and available_sections:
        sections = list(available_sections[:3])
    if not sections:
        sections = ["full_paper"]

    required_audits = ["format_audit"]
    if any(section in sections for section in {"references", "related_work"}):
        required_audits.append("citation_verify")
    if any(section in sections for section in {"experiment", "method"}):
        required_audits.append("figure_table_audit")

    action_plan = [
        "parse intervention intent and confirm affected scope",
        "rewrite only the affected sections",
        "re-run required audits for changed content",
        "update audit report and source bundle",
    ]
    warnings = []
    if "full_paper" in sections:
        warnings.append("scope is broad; interactive confirmation is recommended before rewriting")

    return InterventionPlan(
        target_sections=sections,
        action_plan=action_plan,
        required_audits=required_audits,
        warnings=warnings,
    )


def apply_intervention(draft: PaperDraft, message: str) -> tuple[PaperDraft, InterventionPlan]:
    plan = plan_intervention(message, [section.title for section in draft.sections])
    targets = {target.lower().replace("_", " ") for target in plan.target_sections}
    updated_sections: list[PaperSection] = []
    for section in draft.sections:
        normalized_title = section.title.lower()
        should_update = "full paper" in targets or any(
            _section_matches(target, normalized_title)
            for target in targets
        )
        if not should_update:
            updated_sections.append(section)
            continue
        updated_sections.append(
            PaperSection(
                title=section.title,
                paragraphs=[
                    *section.paragraphs,
                    f"Intervention note: {message.strip()}",
                ],
            )
        )
    return (
        PaperDraft(
            title=draft.title,
            abstract=draft.abstract,
            keywords=draft.keywords,
            sections=updated_sections,
            authors=draft.authors,
            bibliography=draft.bibliography,
        ),
        plan,
    )


def _detect_sections(normalized_message: str) -> list[str]:
    sections: list[str] = []
    for section, keywords in _SECTION_KEYWORDS:
        if any(keyword in normalized_message for keyword in keywords):
            sections.append(section)
    return sections


def _section_matches(target: str, normalized_title: str) -> bool:
    if target in normalized_title or normalized_title in target:
        return True
    if target == "experiment" and any(word in normalized_title for word in ("evaluation", "experiment")):
        return True
    if target == "related work" and "related" in normalized_title:
        return True
    return False
