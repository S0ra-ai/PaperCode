"""章节重新生成辅助工具：上下文构建与提示渲染。"""

from __future__ import annotations

import re
from dataclasses import dataclass


_TOP_LEVEL_HEADING_RE = re.compile(r"^#\s+.+$")
_ANY_HEADING_RE = re.compile(r"^#{1,6}\s+.+$")
_REFERENCE_HEADING_RE = re.compile(
    r"^#\s*[\d.]*\s*(?:参考文献|references|bibliography)\s*$",
    re.IGNORECASE,
)
_CITATION_RE = re.compile(r"\[(\d+)\](?!\()")
_REFERENCE_ENTRY_RE = re.compile(r"^\[(\d+)\]\s.*?(?=^\[\d+\]\s|\Z)", re.MULTILINE | re.DOTALL)


@dataclass(frozen=True)
class RegenerationContext:
    section_heading: str
    target_section: str
    report_structure: str
    nearby_context: str
    evidence_block: str
    citation_numbers: list[int]
    selected_references: list[str]


def split_markdown_sections(markdown: str) -> list[str]:
    """按顶级标题（# ...）拆分 Markdown 为章节列表。"""
    lines = markdown.split("\n")
    sections: list[str] = []
    current: list[str] = []

    for line in lines:
        if _TOP_LEVEL_HEADING_RE.match(line) and current:
            sections.append("\n".join(current).strip())
            current = [line]
        else:
            current.append(line)

    if current:
        sections.append("\n".join(current).strip())

    return sections if sections else [markdown]


def extract_section_heading(section_markdown: str) -> str | None:
    """返回章节的第一个顶级标题（如存在）。"""
    match = re.match(r"^(#\s+.+?)(?:\n|$)", (section_markdown or "").strip())
    return match.group(1).strip() if match else None


def ensure_section_heading(section_markdown: str, expected_heading: str) -> str:
    """确保重新生成的章节保留原始标题。"""
    content = (section_markdown or "").strip()
    if not content:
        return expected_heading

    lines = content.split("\n")
    if lines and _ANY_HEADING_RE.match(lines[0].strip()):
        lines[0] = expected_heading
        return "\n".join(lines).strip()

    return f"{expected_heading}\n\n{content}".strip()


def build_regeneration_context(sections: list[str], section_index: int) -> RegenerationContext:
    """为章节重新生成构建局部结构与证据上下文。"""
    if section_index < 0 or section_index >= len(sections):
        raise ValueError("章节索引超出范围")

    target_section = sections[section_index]
    section_heading = extract_section_heading(target_section) or f"# Section {section_index + 1}"
    citation_numbers = sorted({int(match.group(1)) for match in _CITATION_RE.finditer(target_section)})
    references_section = _find_references_section(sections)
    reference_entries = _parse_reference_entries(references_section)
    selected_references = [
        reference_entries[number]
        for number in citation_numbers
        if number in reference_entries
    ]

    return RegenerationContext(
        section_heading=section_heading,
        target_section=target_section,
        report_structure=_build_report_structure(sections, section_index),
        nearby_context=_build_nearby_context(sections, section_index),
        evidence_block=_build_evidence_block(
            citation_numbers,
            selected_references,
            has_references_section=references_section is not None,
        ),
        citation_numbers=citation_numbers,
        selected_references=selected_references,
    )


def build_grounded_regeneration_prompt(
    context: RegenerationContext,
    custom_prompt: str | None = None,
) -> str:
    """基于当前报告证据渲染重新生成提示词。"""
    extra_instruction = (
        custom_prompt.strip()
        if custom_prompt and custom_prompt.strip()
        else "Improve clarity and depth while staying grounded in the current report evidence."
    )

    return f"""Regenerate the target report section using the current report as the grounding source.

Additional user instruction:
{extra_instruction}

Target section heading:
{context.section_heading}

Report structure:
{context.report_structure}

Nearby section context:
{context.nearby_context}

Original section:
{context.target_section}

Evidence block:
{context.evidence_block}

Requirements:
- Preserve the exact heading: {context.section_heading}
- Keep the same language, markdown format, and citation style such as [N]
- Prefer the provided evidence block and existing citation numbers when revising
- Do not invent new references, URLs, or unsupported citation numbers
- Maintain coherence with nearby sections and avoid contradictions
- Return ONLY the regenerated markdown for the target section"""


def _build_report_structure(sections: list[str], section_index: int) -> str:
    lines = []
    for index, section in enumerate(sections):
        heading = extract_section_heading(section) or f"Section {index + 1}"
        marker = " (target)" if index == section_index else ""
        lines.append(f"- {heading}{marker}")
    return "\n".join(lines)


def _build_nearby_context(sections: list[str], section_index: int) -> str:
    items = []
    neighbors = (
        ("Previous section", section_index - 1),
        ("Next section", section_index + 1),
    )
    for label, index in neighbors:
        if 0 <= index < len(sections):
            heading = extract_section_heading(sections[index]) or f"Section {index + 1}"
            excerpt = _summarize_section_excerpt(sections[index])
            items.append(f"{label}: {heading}\n{excerpt}")

    return "\n\n".join(items) if items else "No neighboring sections are available."


def _summarize_section_excerpt(section_markdown: str, max_chars: int = 700) -> str:
    heading = extract_section_heading(section_markdown)
    body = section_markdown.strip()
    if heading and body.startswith(heading):
        body = body[len(heading):].strip()

    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", body) if paragraph.strip()]
    excerpt = "\n\n".join(paragraphs[:2]).strip()
    if not excerpt:
        return "(No body content)"
    if len(excerpt) <= max_chars:
        return excerpt
    return excerpt[:max_chars].rstrip() + "..."


def _build_evidence_block(
    citation_numbers: list[int],
    selected_references: list[str],
    *,
    has_references_section: bool,
) -> str:
    lines = []

    if citation_numbers:
        citation_text = ", ".join(f"[{number}]" for number in citation_numbers)
        lines.append(f"Citations already used in the original section: {citation_text}")
    else:
        lines.append("No citation markers were found in the original section.")

    if selected_references:
        lines.append("Matched reference entries:")
        lines.extend(selected_references)
    elif has_references_section and citation_numbers:
        lines.append("A references section exists, but no matching entries were recovered for the cited numbers.")
    elif has_references_section:
        lines.append("A references section exists, but this section does not cite any specific entries yet.")
    else:
        lines.append("No references section was found in the current report.")

    return "\n".join(lines)


def _find_references_section(sections: list[str]) -> str | None:
    for section in sections:
        heading = extract_section_heading(section)
        if heading and _REFERENCE_HEADING_RE.match(heading):
            return section
    return None


def _parse_reference_entries(references_section: str | None) -> dict[int, str]:
    if not references_section:
        return {}

    body = references_section.strip()
    heading = extract_section_heading(body)
    if heading and body.startswith(heading):
        body = body[len(heading):].strip()

    entries: dict[int, str] = {}
    for match in _REFERENCE_ENTRY_RE.finditer(body):
        entries[int(match.group(1))] = match.group(0).strip()
    return entries
