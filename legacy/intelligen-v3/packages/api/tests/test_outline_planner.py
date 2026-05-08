"""Tests for grounded outline planning and deterministic outline review."""

import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.schemas import OutlineSection, ReportOutline
from app.modules.generation.services.outline_planner import OutlinePlanner


class TestOutlinePlanner:

    def test_plan_uses_evidence_and_refines_outline(self):
        """Generated outlines should use evidence prompts and pass review cleanup."""
        llm = MagicMock()
        captured = {}

        raw_outline = ReportOutline(
            title="可解释人工智能",
            sections=[
                OutlineSection(
                    number="1",
                    title="方法分析",
                    instruction="分析主要技术路线。",
                    target_words=120,
                    search_queries=[],
                ),
                OutlineSection(
                    number="2",
                    title="方法分析",
                    instruction="补充讨论代表性模型与评估方法。",
                    target_words=3600,
                    search_queries=["", "xai methods"],
                ),
                OutlineSection(
                    number="3",
                    title="医疗应用",
                    instruction="",
                    target_words=100,
                    search_queries=[],
                ),
            ],
        )

        def fake_chat_json(messages, schema, task_type="planning"):
            captured["messages"] = messages
            return raw_outline

        llm.chat_json.side_effect = fake_chat_json
        planner = OutlinePlanner(llm)
        evidence_summary = """Seed queries:
- precise: explainable AI medical applications
- general: explainable AI healthcare review
- arxiv: explainable ai interpretation

Representative evidence:
- A Survey of Explainable AI (Crossref, 2024): Survey of XAI methods and medical use cases.
"""

        outline = planner.plan(
            "可解释人工智能",
            requirement="聚焦医疗场景",
            evidence_summary=evidence_summary,
        )

        prompt = captured["messages"][-1].content
        assert "explainable AI medical applications" in prompt

        titles = [section.title for section in outline.sections]
        assert titles[0] == "引言"
        assert titles[-2] == "结论与展望"
        assert titles[-1] == "参考文献"
        assert titles.count("方法分析") == 1
        assert [section.number for section in outline.sections] == ["1", "2", "3", "4", "5"]
        assert all(section.search_queries or section.title == "参考文献" for section in outline.sections)

        method_section = next(section for section in outline.sections if section.title == "方法分析")
        assert 900 <= method_section.target_words <= 2200
        assert "xai methods" in [query.lower() for query in method_section.search_queries]

    def test_outline_text_path_preserves_user_structure(self):
        """User-provided outline path should keep custom structure and still add refs."""
        llm = MagicMock()
        llm.chat_json.return_value = ReportOutline(
            title="量子计算",
            sections=[
                OutlineSection(
                    number="3",
                    title="研究背景",
                    instruction="",
                    target_words=900,
                    search_queries=[],
                ),
                OutlineSection(
                    number="4",
                    title="核心案例",
                    instruction="",
                    target_words=1100,
                    search_queries=[],
                ),
            ],
        )
        planner = OutlinePlanner(llm)

        outline = planner.plan("量子计算", outline="1. 研究背景\n2. 核心案例")

        titles = [section.title for section in outline.sections]
        assert titles == ["研究背景", "核心案例", "参考文献"]
        assert all(section.search_queries or section.title == "参考文献" for section in outline.sections)
