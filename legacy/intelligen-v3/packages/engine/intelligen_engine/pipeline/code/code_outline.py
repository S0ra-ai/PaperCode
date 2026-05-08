"""Code-to-paper outline generator — maps code analysis to paper sections.

Generates a system design paper outline from CodeArchitectureAnalysis,
with sections that map to specific code components.
"""

from __future__ import annotations

import json
import logging
from typing import List, Optional

from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, HumanMessage

from intelligen_engine.core.config import settings
from intelligen_engine.pipeline.code.code_agent import CodeArchitectureAnalysis
from intelligen_engine.prompts.prompt_manager import PromptManager

logger = logging.getLogger(__name__)


class OutlineSection(BaseModel):
    title: str
    description: str = ""
    target_words: int = 500
    mapped_modules: list[str] = Field(default_factory=list)
    key_points: list[str] = Field(default_factory=list)


class CodePaperOutline(BaseModel):
    """Paper outline generated from code analysis."""
    paper_title: str = ""
    abstract_points: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    sections: list[OutlineSection] = Field(default_factory=list)
    total_target_words: int = 5000



class CodeOutlineGenerator:
    """Generates a paper outline from code architecture analysis."""

    def __init__(self, llm_service=None):
        if llm_service is None:
            from intelligen_engine.pipeline.shared.llm_service import LLMService
            llm_service = LLMService()
        self._llm = llm_service

    def generate(self, analysis: CodeArchitectureAnalysis) -> CodePaperOutline:
        """Generate paper outline from architecture analysis."""
        schema_json = CodePaperOutline.model_json_schema()
        pm = PromptManager.get_instance()
        system = pm.render("code_outline", "system_prompt",
                           schema=json.dumps(schema_json, indent=2, ensure_ascii=False))

        analysis_text = json.dumps(analysis.model_dump(), indent=2, ensure_ascii=False)
        user_msg = f"Architecture analysis:\n\n{analysis_text[:12000]}"

        messages = [
            SystemMessage(content=system),
            HumanMessage(content=user_msg),
        ]

        try:
            llm = self._llm._get_llm(
                model=settings.resolved_fast_model,
                temperature=0.1,
            )
            response = llm.invoke(messages)
            raw = response.content.strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
                if raw.endswith("```"):
                    raw = raw[:-3]
            parsed = json.loads(raw)
            return CodePaperOutline(**parsed)
        except Exception as e:
            logger.warning("Code outline generation failed: %s — using defaults", e)
            return self._default_outline(analysis)

    def _default_outline(self, analysis: CodeArchitectureAnalysis) -> CodePaperOutline:
        """Produce a reasonable default outline when LLM is unavailable."""
        modules = [m.name for m in analysis.modules]
        return CodePaperOutline(
            paper_title=f"System Design: {analysis.project_summary[:60]}",
            keywords=analysis.technologies[:5],
            sections=[
                OutlineSection(title="引言", description="项目背景和目标", target_words=600),
                OutlineSection(title="相关工作", description="相关系统和技术综述", target_words=500),
                OutlineSection(
                    title="系统架构",
                    description=f"Architecture: {analysis.architecture_style}",
                    target_words=800,
                    mapped_modules=modules,
                ),
                OutlineSection(
                    title="核心模块设计",
                    description="Key modules and their interactions",
                    target_words=1000,
                    mapped_modules=modules,
                ),
                OutlineSection(
                    title="实现细节",
                    description="Algorithms, data structures, and tech stack",
                    target_words=800,
                    key_points=analysis.key_algorithms[:5],
                ),
                OutlineSection(title="测试与评估", description="Testing strategy and results", target_words=500),
                OutlineSection(title="总结与展望", description="Summary and future work", target_words=400),
            ],
            total_target_words=4600,
        )

    def generate_to_dict(self, analysis: CodeArchitectureAnalysis) -> dict:
        return self.generate(analysis).model_dump()
