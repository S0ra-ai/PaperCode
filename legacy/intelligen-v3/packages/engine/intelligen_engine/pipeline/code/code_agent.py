"""Code analysis agent — uses LLM to generate architecture summaries from code.

Uses the qwen-coder-plus model for deep code understanding.
"""

from __future__ import annotations

import json
import logging
from typing import Dict, Optional

from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, HumanMessage

from intelligen_engine.core.config import settings
from intelligen_engine.pipeline.code.code_parser import CodeAnalysis
from intelligen_engine.prompts.prompt_manager import PromptManager

logger = logging.getLogger(__name__)


# ── Output schema ──────────────────────────────────────────

class ModuleDescription(BaseModel):
    name: str
    purpose: str
    key_classes: list[str] = Field(default_factory=list)
    key_functions: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)


class CodeArchitectureAnalysis(BaseModel):
    """Structured analysis of a codebase produced by the code agent."""
    project_summary: str = ""
    architecture_style: str = ""
    key_algorithms: list[str] = Field(default_factory=list)
    design_patterns: list[str] = Field(default_factory=list)
    data_flow: str = ""
    modules: list[ModuleDescription] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    areas_for_improvement: list[str] = Field(default_factory=list)


# ── Agent ──────────────────────────────────────────────────


class CodeAgent:
    """Analyses code structure using LLM to produce architecture insights."""

    def __init__(self, llm_service=None):
        if llm_service is None:
            from intelligen_engine.pipeline.shared.llm_service import LLMService
            llm_service = LLMService()
        self._llm = llm_service

    def analyse(self, code_analysis: CodeAnalysis) -> CodeArchitectureAnalysis:
        """Run LLM analysis on the parsed code structure."""
        schema_json = CodeArchitectureAnalysis.model_json_schema()
        pm = PromptManager.get_instance()
        system = pm.render("code_analysis", "system_prompt",
                           schema=json.dumps(schema_json, indent=2, ensure_ascii=False))

        summary = code_analysis.summary_text()
        user_msg = f"Code structure analysis:\n\n{summary[:15000]}"

        messages = [
            SystemMessage(content=system),
            HumanMessage(content=user_msg),
        ]

        try:
            llm = self._llm._get_llm(
                model=settings.LLM_CODE_MODEL,
                temperature=0.0,
            )
            response = llm.invoke(messages)
            raw = response.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
            parsed = json.loads(raw)
            return CodeArchitectureAnalysis(**parsed)
        except Exception as e:
            logger.warning("Code analysis LLM call failed: %s — returning minimal result", e)
            return CodeArchitectureAnalysis(
                project_summary=f"Code project with {code_analysis.total_files} files "
                                f"in {', '.join(code_analysis.languages.keys())}.",
                technologies=list(code_analysis.languages.keys()),
            )

    def analyse_to_dict(self, code_analysis: CodeAnalysis) -> dict:
        """Convenience: return analysis as a plain dict."""
        return self.analyse(code_analysis).model_dump()
