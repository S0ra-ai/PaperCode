"""Clarification Agent — progressive, one-at-a-time question generation.

Generates a single clarification question based on the user's topic
and previous Q&A history. Supports document-aware skipping.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage

from intelligen_engine.pipeline.shared.llm_service import LLMService
from intelligen_engine.core.config import settings
from intelligen_engine.prompts.prompt_manager import PromptManager

logger = logging.getLogger(__name__)


@dataclass
class ClarificationQuestion:
    """A single question returned by the agent."""
    question: str
    options: list[str] = field(default_factory=list)
    allow_multiple: bool = False
    allow_custom: bool = True
    explanation: str = ""
    is_complete: bool = False


@dataclass
class QAEntry:
    """A single question-answer pair in the conversation history."""
    question: str
    answer: str
    skipped: bool = False


@dataclass
class DocumentInfo:
    """Key information extracted from an uploaded document."""
    title: str = ""
    abstract: str = ""
    keywords: list[str] = field(default_factory=list)
    methodology: str = ""
    raw_excerpt: str = ""


class ClarificationAgent:
    """Generates clarification questions one at a time using LLM.

    Progresses from broad (paper type) → specific (methodology details).
    Analyzes uploaded docs to skip already-answered questions.
    """

    MAX_QUESTIONS = 6
    MAX_DOC_EXCERPT_CHARS = 2000

    def __init__(self, llm_service: Optional[LLMService] = None):
        self._llm = llm_service or LLMService()

    async def get_next_question(
        self,
        topic: str,
        history: list[dict],
        document_info: Optional[dict] = None,
    ) -> ClarificationQuestion:
        """Generate the next clarification question.

        Args:
            topic: The user's research topic.
            history: List of {"question": ..., "answer": ...} dicts.
            document_info: Optional extracted document metadata.

        Returns:
            ClarificationQuestion with is_complete=True when enough info collected.
        """
        if len(history) >= self.MAX_QUESTIONS:
            return ClarificationQuestion(
                question="", is_complete=True,
                explanation="已收集足够信息，可以开始生成。"
            )

        history_text = self._format_history(history)
        doc_context = self._format_doc_info(document_info) if document_info else ""

        prompt = self._build_prompt(topic, history_text, doc_context, len(history))

        try:
            messages = [HumanMessage(content=prompt)]
            response = self._llm.chat_routed(messages, task_type="clarify")
            raw = response.get("content", "")
            return self._parse_response(raw)
        except Exception as e:
            logger.warning(f"Clarification LLM failed, using fallback: {e}")
            return self._fallback_question(topic, len(history))

    async def get_summary(
        self,
        topic: str,
        history: list[dict],
        document_info: Optional[dict] = None,
    ) -> dict:
        """Generate a summary of collected clarification info.

        Returns:
            Dict with keys: topic, paper_type, scope, methodology, target_words, etc.
        """
        history_text = self._format_history(history)
        doc_context = self._format_doc_info(document_info) if document_info else ""

        pm = PromptManager.get_instance()
        prompt = pm.render("clarify_agent", "get_summary",
                           topic=topic, doc_context=doc_context, history_text=history_text)

        try:
            messages = [HumanMessage(content=prompt)]
            response = self._llm.chat_routed(messages, task_type="clarify")
            raw = response.get("content", "")
            return self._parse_json(raw) or {"topic": topic}
        except Exception as e:
            logger.warning(f"Summary generation failed: {e}")
            return self._build_fallback_summary(topic, history)

    async def extract_document_info(
        self,
        text_excerpt: str,
        file_name: str = "",
    ) -> DocumentInfo:
        """Extract key info from an uploaded document using LLM.

        Args:
            text_excerpt: First N characters of the document content.
            file_name: Original file name for context.

        Returns:
            DocumentInfo with extracted metadata.
        """
        excerpt = text_excerpt[: self.MAX_DOC_EXCERPT_CHARS]

        pm = PromptManager.get_instance()
        prompt = pm.render("clarify_agent", "extract_document_info",
                           file_name=file_name, excerpt=excerpt)

        try:
            messages = [HumanMessage(content=prompt)]
            response = self._llm.chat_routed(messages, task_type="clarify")
            raw = response.get("content", "")
            parsed = self._parse_json(raw) or {}
            return DocumentInfo(
                title=parsed.get("title", ""),
                abstract=parsed.get("abstract", ""),
                keywords=parsed.get("keywords", []),
                methodology=parsed.get("methodology", ""),
                raw_excerpt=excerpt[:500],
            )
        except Exception as e:
            logger.warning(f"Document extraction failed: {e}")
            return DocumentInfo(raw_excerpt=excerpt[:500])

    # ── Private helpers ──────────────────────────────────────

    def _build_prompt(
        self, topic: str, history_text: str, doc_context: str, step: int
    ) -> str:
        stage_hint = self._get_stage_hint(step)

        pm = PromptManager.get_instance()
        return pm.render("clarify_agent", "build_prompt",
                         topic=topic, doc_context=doc_context,
                         history_text=history_text if history_text else "(no previous questions yet)",
                         current_step=str(step + 1), max_steps=str(self.MAX_QUESTIONS),
                         stage_hint=stage_hint)

    def _get_stage_hint(self, step: int) -> str:
        pm = PromptManager.get_instance()
        hints = pm.get_raw("clarify_agent", "stage_hints") or [
            "Ask about the TYPE of paper (survey/review, experimental, design, etc.)",
            "Ask about SCOPE — how broad or narrow the topic should be",
            "Ask about TARGET AUDIENCE and formality level",
            "Ask about METHODOLOGY or analytical approach preferences",
            "Ask about specific FOCUS AREAS or key aspects to cover",
            "Ask about LENGTH, citation style, or any remaining preferences",
        ]
        return hints[min(step, len(hints) - 1)]

    def _format_history(self, history: list[dict]) -> str:
        if not history:
            return ""
        lines = []
        for i, entry in enumerate(history, 1):
            q = entry.get("question", "")
            a = entry.get("answer", "(skipped)")
            lines.append(f"Q{i}: {q}\nA{i}: {a}")
        return "\n".join(lines)

    def _format_doc_info(self, doc_info: Optional[dict]) -> str:
        if not doc_info:
            return ""
        parts = ["Document context:"]
        if doc_info.get("title"):
            parts.append(f"  Title: {doc_info['title']}")
        if doc_info.get("abstract"):
            parts.append(f"  Abstract: {doc_info['abstract'][:300]}")
        if doc_info.get("keywords"):
            parts.append(f"  Keywords: {', '.join(doc_info['keywords'])}")
        if doc_info.get("methodology"):
            parts.append(f"  Methodology: {doc_info['methodology']}")
        return "\n".join(parts)

    def _parse_response(self, raw: str) -> ClarificationQuestion:
        parsed = self._parse_json(raw)
        if not parsed:
            return self._fallback_question("", 0)

        return ClarificationQuestion(
            question=str(parsed.get("question", "")),
            options=[str(o) for o in parsed.get("options", []) if o],
            allow_multiple=bool(parsed.get("allow_multiple", False)),
            allow_custom=True,
            explanation=str(parsed.get("explanation", "")),
            is_complete=bool(parsed.get("is_complete", False)),
        )

    def _parse_json(self, raw: str) -> Optional[dict]:
        # Strip markdown fences
        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", raw, re.DOTALL)
        text = json_match.group(1).strip() if json_match else raw.strip()

        # Find JSON object
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start == -1 or brace_end == -1:
            return None
        try:
            return json.loads(text[brace_start : brace_end + 1])
        except json.JSONDecodeError:
            return None

    def _fallback_question(self, topic: str, step: int) -> ClarificationQuestion:
        """Return a sensible hardcoded question based on the step."""
        is_zh = bool(re.search(r"[\u4e00-\u9fff]", topic))
        pm = PromptManager.get_instance()
        lang_key = "fallback_zh" if is_zh else "fallback_en"
        fallbacks_data = pm.get_raw("clarify_agent", lang_key) or []

        fallbacks = []
        for item in fallbacks_data:
            fallbacks.append(ClarificationQuestion(
                question=item.get("question", ""),
                options=item.get("options", []),
                allow_custom=item.get("allow_custom", True),
                explanation=item.get("explanation", ""),
            ))

        if not fallbacks:
            return ClarificationQuestion(
                question="Any additional requirements?",
                options=["No special requirements"],
                explanation="Fallback question.",
            )

        idx = min(step, len(fallbacks) - 1)
        return fallbacks[idx]

    def _build_fallback_summary(self, topic: str, history: list[dict]) -> dict:
        """Build a summary from Q&A history without LLM."""
        summary: dict[str, Any] = {"topic": topic}
        for entry in history:
            answer = entry.get("answer", "")
            if not answer:
                continue
            q_lower = entry.get("question", "").lower()
            if any(kw in q_lower for kw in ["类型", "type"]):
                summary["paper_type"] = answer
            elif any(kw in q_lower for kw in ["字数", "word count", "字"]):
                summary["target_words"] = answer
            elif any(kw in q_lower for kw in ["时间", "time range", "年"]):
                summary["time_range"] = answer
            elif any(kw in q_lower for kw in ["读者", "audience"]):
                summary["target_audience"] = answer
            elif any(kw in q_lower for kw in ["对比", "compare"]):
                summary["comparison_needed"] = answer
        return summary
