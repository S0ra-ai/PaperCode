"""
Clarification Service — refines vague user prompts before generation.

Strategy:
  1. Heuristics first: skip clarification if prompt is already detailed enough
  2. LLM-based clarification: generate structured questions (JSON output) for vague prompts
  3. Structured output: return {topic, requirements, suggestedOutline}
  4. Fail-open: if clarification LLM fails, proceed with rich fallback questions
"""
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage

from intelligen_engine.pipeline.shared.llm_service import LLMService
from intelligen_engine.core.config import settings
from intelligen_engine.core.exceptions import LLMGenerationError
from intelligen_engine.prompts.prompt_manager import PromptManager

logger = logging.getLogger(__name__)

# Heuristic thresholds
_MIN_WORDS_FOR_SKIP = 30
_DETAIL_INDICATORS = [
    r"\d+\s*(页|章|字|words?|pages?|章节|sections?)",  # explicit length/structure
    r"(包含|包括|include|cover|涉及)",                  # scope specification
    r"(背景|方法|结论|introduction|method|conclusion)",  # section keywords
    r"(对比|比较|分析|analyze|compare|evaluate)",        # analytical intent
    r"(参考|引用|cite|reference)",                       # citation awareness
]
_DETAIL_THRESHOLD = 2  # need at least this many indicators to skip


@dataclass
class ClarificationQuestion:
    """A single clarification question for the user."""
    id: str
    question: str
    hint: str = ""
    options: List[str] = field(default_factory=list)
    priority: str = "medium"  # "high" | "medium" | "low"
    required: bool = False


@dataclass
class ClarificationResult:
    """Result of the clarification process."""
    needs_clarification: bool
    questions: List[ClarificationQuestion] = field(default_factory=list)
    reason: str = ""


@dataclass
class RefinedRequirement:
    """Structured output after user answers clarification questions."""
    topic: str
    requirements: str
    suggested_outline: List[str] = field(default_factory=list)
    target_words: int = 0
    language: str = "zh"


class ClarifyService:
    """Generates clarification questions for vague prompts."""

    def __init__(self, llm_service: Optional[LLMService] = None):
        self._llm = llm_service or LLMService()

    def check_needs_clarification(
        self,
        user_input: str,
        has_outline: bool = False,
        has_template: bool = False,
        has_files: bool = False,
    ) -> ClarificationResult:
        """Cheap heuristic check — no LLM call."""
        words = user_input.strip().split()
        word_count = len(words)

        # Already has outline → user has thought about structure
        if has_outline:
            return ClarificationResult(needs_clarification=False, reason="outline_provided")

        # Has template + files → structured input
        if has_template and has_files:
            return ClarificationResult(needs_clarification=False, reason="template_and_files")

        # Long enough prompt with detail indicators
        if word_count >= _MIN_WORDS_FOR_SKIP:
            detail_score = sum(
                1 for pat in _DETAIL_INDICATORS if re.search(pat, user_input, re.IGNORECASE)
            )
            if detail_score >= _DETAIL_THRESHOLD:
                return ClarificationResult(needs_clarification=False, reason="detailed_prompt")

        # Very short prompt → definitely needs clarification
        if word_count < 8:
            return ClarificationResult(
                needs_clarification=True,
                reason="too_brief",
            )

        # Medium-length prompt without enough detail → needs clarification
        return ClarificationResult(
            needs_clarification=True,
            reason="lacks_detail",
        )

    async def generate_questions(
        self,
        user_input: str,
        file_names: Optional[List[str]] = None,
        template_name: Optional[str] = None,
    ) -> List[ClarificationQuestion]:
        """Use LLM to generate structured clarification questions. Fail-open on error."""
        context_parts = [f"用户输入: {user_input}"]
        if file_names:
            context_parts.append(f"上传文件: {', '.join(file_names)}")
        if template_name:
            context_parts.append(f"模板: {template_name}")
        context = "\n".join(context_parts)

        pm = PromptManager.get_instance()
        prompt = pm.render("clarification", "generate_questions", context=context)

        try:
            messages = [HumanMessage(content=prompt)]
            response = self._llm.chat_routed(messages, task_type="clarify")
            raw = response.get("content", "")
            parsed = self._parse_json_questions(raw)
            if parsed:
                return parsed
            line_parsed = self._parse_line_questions(raw)
            if line_parsed:
                return line_parsed
            raise LLMGenerationError(detail="LLM 返回内容无法解析为澄清问题")
        except (LLMGenerationError,):
            raise
        except Exception as e:
            logger.error(f"Clarification LLM call failed: {e}")
            raise LLMGenerationError(detail=str(e)) from e

    def refine_requirement(
        self,
        user_input: str,
        answers: Dict[str, str],
    ) -> RefinedRequirement:
        """Merge user input with clarification answers into structured requirement."""
        # Build requirement text from non-empty answers only
        answer_text = "\n".join(
            f"- {v}" for v in answers.values()
            if isinstance(v, str) and v.strip()
        )
        requirements = f"{user_input}\n\n补充说明:\n{answer_text}" if answer_text else user_input

        # Extract topic (first sentence or short phrase)
        topic = user_input.strip().split("。")[0].split(".")[0].strip()
        if len(topic) > 100:
            topic = topic[:100]

        # Try to extract target words from answers
        target_words = 0
        for v in answers.values():
            if not isinstance(v, str):
                continue
            match = re.search(r"(\d{3,6})\s*(字|words?)", v)
            if match:
                target_words = int(match.group(1))
                break

        # Detect language
        chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", user_input))
        language = "zh" if chinese_chars > len(user_input) * 0.1 else "en"

        return RefinedRequirement(
            topic=topic,
            requirements=requirements,
            target_words=target_words,
            language=language,
        )

    def _parse_json_questions(self, raw: str) -> List[ClarificationQuestion]:
        """Parse JSON-formatted questions from LLM output."""
        # Extract JSON from markdown code block or raw text
        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", raw, re.DOTALL)
        json_str = json_match.group(1).strip() if json_match else raw.strip()

        # Try to find JSON array in the text
        bracket_start = json_str.find("[")
        bracket_end = json_str.rfind("]")
        if bracket_start == -1 or bracket_end == -1:
            return []
        json_str = json_str[bracket_start:bracket_end + 1]

        try:
            items = json.loads(json_str)
        except json.JSONDecodeError:
            return []

        if not isinstance(items, list):
            return []

        questions = []
        for i, item in enumerate(items[:5]):
            if not isinstance(item, dict) or "question" not in item:
                continue
            priority = str(item.get("priority", "medium")).lower()
            if priority not in ("high", "medium", "low"):
                priority = "medium"
            questions.append(ClarificationQuestion(
                id=f"q{i + 1}",
                question=str(item["question"]),
                hint=str(item.get("hint", "")),
                options=[str(o) for o in item.get("options", []) if o],
                priority=priority,
                required=bool(item.get("required", priority == "high")),
            ))
        return questions

    def _parse_line_questions(self, raw: str) -> List[ClarificationQuestion]:
        """Fallback: parse Q1: ... line format from LLM output."""
        questions = []
        for line in raw.strip().splitlines():
            line = line.strip()
            match = re.match(r"Q\d+[:：]\s*(.+)", line)
            if match:
                q_text = match.group(1).strip()
                questions.append(ClarificationQuestion(
                    id=f"q{len(questions) + 1}",
                    question=q_text,
                    priority="high" if len(questions) == 0 else "medium",
                    required=len(questions) == 0,
                ))
        return questions[:5] if questions else []
