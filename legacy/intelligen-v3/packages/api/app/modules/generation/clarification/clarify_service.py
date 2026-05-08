"""澄清服务：处理模糊用户输入的交互式澄清。"""
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage

from app.modules.generation.shared.llm_service import LLMService
from app.platform.config import settings
from app.platform.exceptions import LLMGenerationError

logger = logging.getLogger(__name__)

_MIN_WORDS_FOR_SKIP = 30
_DETAIL_INDICATORS = [
    r"\d+\s*(页|章|字|words?|pages?|章节|sections?)",
    r"(包含|包括|include|cover|涉及)",
    r"(背景|方法|结论|introduction|method|conclusion)",
    r"(对比|比较|分析|analyze|compare|evaluate)",
    r"(参考|引用|cite|reference)",
]
_DETAIL_THRESHOLD = 2


@dataclass
class ClarificationQuestion:
    """面向用户的单条澄清问题。"""
    id: str
    question: str
    hint: str = ""
    options: List[str] = field(default_factory=list)
    priority: str = "medium"
    required: bool = False


@dataclass
class ClarificationResult:
    """澄清流程的结果。"""
    needs_clarification: bool
    questions: List[ClarificationQuestion] = field(default_factory=list)
    reason: str = ""


@dataclass
class RefinedRequirement:
    """用户回答澄清问题后的结构化需求。"""
    topic: str
    requirements: str
    suggested_outline: List[str] = field(default_factory=list)
    target_words: int = 0
    language: str = "zh"


class ClarifyService:
    """澄清服务：先用启发式规则快速判断是否需要澄清，再通过 LLM 生成结构化问题，最终将用户回答合并为细化需求。"""

    def __init__(self, llm_service: Optional[LLMService] = None):
        self._llm = llm_service or LLMService()

    def check_needs_clarification(
        self,
        user_input: str,
        has_outline: bool = False,
        has_template: bool = False,
        has_files: bool = False,
    ) -> ClarificationResult:
        """基于启发式规则的快速判断，无需 LLM 调用。"""
        words = user_input.strip().split()
        word_count = len(words)

        if has_outline:
            return ClarificationResult(needs_clarification=False, reason="outline_provided")

        if has_template and has_files:
            return ClarificationResult(needs_clarification=False, reason="template_and_files")

        if word_count >= _MIN_WORDS_FOR_SKIP:
            detail_score = sum(
                1 for pat in _DETAIL_INDICATORS if re.search(pat, user_input, re.IGNORECASE)
            )
            if detail_score >= _DETAIL_THRESHOLD:
                return ClarificationResult(needs_clarification=False, reason="detailed_prompt")

        if word_count < 8:
            return ClarificationResult(
                needs_clarification=True,
                reason="too_brief",
            )

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
        """调用 LLM 生成结构化澄清问题；失败时向上抛出异常。"""
        context_parts = [f"用户输入: {user_input}"]
        if file_names:
            context_parts.append(f"上传文件: {', '.join(file_names)}")
        if template_name:
            context_parts.append(f"模板: {template_name}")
        context = "\n".join(context_parts)

        prompt = f"""你是一个学术报告生成助手。用户给了一个模糊的需求，你需要生成 3-5 个澄清问题帮助细化需求。

{context}

请严格以 JSON 数组格式输出，不要输出其他内容：
```json
[
  {{
    "question": "问题内容",
    "hint": "输入提示文字",
    "options": ["选项1", "选项2", "选项3"],
    "priority": "high",
    "required": true
  }}
]
```

字段说明：
- question: 问题文字
- hint: 输入框占位提示
- options: 常见选项（用户也可自由输入），至少给2个
- priority: "high"=核心问题必须回答, "medium"=建议回答, "low"=可选
- required: 是否必填

要求：
- 第1个问题必须是 high priority，关于研究的核心范围/对象
- 涵盖：研究范围与对象、目标篇幅、时间范围、对比需求、受众
- 用中文提问（如果用户输入是中文）或英文（如果用户输入是英文）
- 3-5个问题，其中至少1个 high, 1-2个 medium, 其余 low"""

        try:
            messages = [HumanMessage(content=prompt)]
            response = self._llm.chat_routed(messages, task_type="clarify")
            raw = response.get("content", "")
            parsed = self._parse_json_questions(raw)
            if parsed:
                return parsed
            return self._parse_line_questions(raw) or []
        except Exception as e:
            logger.warning(f"Clarification LLM call failed: {e}")
            raise LLMGenerationError(detail=str(e)) from e

    def refine_requirement(
        self,
        user_input: str,
        answers: Dict[str, str],
    ) -> RefinedRequirement:
        """将用户输入与澄清回答合并为结构化需求。"""
        answer_text = "\n".join(
            f"- {v}" for v in answers.values()
            if isinstance(v, str) and v.strip()
        )
        requirements = f"{user_input}\n\n补充说明:\n{answer_text}" if answer_text else user_input

        topic = user_input.strip().split("。")[0].split(".")[0].strip()
        if len(topic) > 100:
            topic = topic[:100]

        target_words = 0
        for v in answers.values():
            if not isinstance(v, str):
                continue
            match = re.search(r"(\d{3,6})\s*(字|words?)", v)
            if match:
                target_words = int(match.group(1))
                break

        chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", user_input))
        language = "zh" if chinese_chars > len(user_input) * 0.1 else "en"

        return RefinedRequirement(
            topic=topic,
            requirements=requirements,
            target_words=target_words,
            language=language,
        )

    def _parse_json_questions(self, raw: str) -> List[ClarificationQuestion]:
        """从 LLM 输出中解析 JSON 格式的问题列表。"""
        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", raw, re.DOTALL)
        json_str = json_match.group(1).strip() if json_match else raw.strip()

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
        """回退方案：从 LLM 输出中解析 Q1: ... 行格式的问题。"""
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
