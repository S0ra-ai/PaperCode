"""Template parser — extracts formatting structure from uploaded documents.

Uses a fast LLM model to analyse document structure and produce a JSON
format definition that matches the Template.format_json schema.
"""

from __future__ import annotations

import json
import logging
from typing import Dict, Optional

from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, HumanMessage

from intelligen_engine.core.config import settings
from intelligen_engine.prompts.prompt_manager import PromptManager

logger = logging.getLogger(__name__)

# ── Output schema ──────────────────────────────────────────

class PageLayout(BaseModel):
    margin_top_cm: float = 2.54
    margin_bottom_cm: float = 2.54
    margin_left_cm: float = 3.17
    margin_right_cm: float = 3.17
    page_size: str = "A4"


class TextStyle(BaseModel):
    font_family: str = "SimSun"
    font_size_pt: float = 12.0
    bold: bool = False
    italic: bool = False
    line_spacing: float = 1.5
    alignment: str = "left"


class HeadingStyle(BaseModel):
    level: int = 1
    font_family: str = "SimHei"
    font_size_pt: float = 16.0
    bold: bool = True
    alignment: str = "center"
    spacing_before_pt: float = 12.0
    spacing_after_pt: float = 6.0
    numbering_format: str = ""


class SectionDef(BaseModel):
    title: str
    required: bool = True
    description: str = ""
    order: int = 0


class CitationFormat(BaseModel):
    style: str = "GB/T 7714"
    in_text_format: str = "[1]"
    bibliography_format: str = "numbered"


class HeaderFooter(BaseModel):
    header_text: str = ""
    footer_text: str = ""
    page_number_position: str = "bottom-center"


class FormatDefinition(BaseModel):
    """Complete format definition extracted from a template document."""
    page_layout: PageLayout = Field(default_factory=PageLayout)
    body_style: TextStyle = Field(default_factory=TextStyle)
    heading_styles: list[HeadingStyle] = Field(default_factory=list)
    sections: list[SectionDef] = Field(default_factory=list)
    citation_format: CitationFormat = Field(default_factory=CitationFormat)
    header_footer: HeaderFooter = Field(default_factory=HeaderFooter)
    abstract_required: bool = True
    keywords_required: bool = True
    cover_page_required: bool = False
    table_of_contents: bool = True
    extra_notes: str = ""


# ── Parser ─────────────────────────────────────────────────


class TemplateParser:
    """Parses uploaded document content to extract formatting structure."""

    def __init__(self, llm_service=None):
        if llm_service is None:
            from intelligen_engine.pipeline.shared.llm_service import LLMService
            llm_service = LLMService()
        self._llm = llm_service

    def parse(self, content: str, filename: str = "") -> FormatDefinition:
        """Analyse document content and return a FormatDefinition."""
        schema_json = FormatDefinition.model_json_schema()
        pm = PromptManager.get_instance()
        system = pm.render("template_parsing", "system_prompt",
                           schema=json.dumps(schema_json, indent=2, ensure_ascii=False))

        user_msg = f"Filename: {filename}\n\nDocument content:\n{content[:12000]}"

        messages = [
            SystemMessage(content=system),
            HumanMessage(content=user_msg),
        ]

        try:
            llm = self._llm._get_llm(model=settings.resolved_fast_model, temperature=0.0)
            response = llm.invoke(messages)
            raw = response.content.strip()
            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
            parsed = json.loads(raw)
            return FormatDefinition(**parsed)
        except Exception as e:
            logger.warning("Template parsing LLM call failed: %s — returning defaults", e)
            return FormatDefinition()

    def parse_to_dict(self, content: str, filename: str = "") -> dict:
        """Convenience: return format definition as a plain dict."""
        return self.parse(content, filename).model_dump()
