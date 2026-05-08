# SPDX-License-Identifier: MPL-2.0
# ruff: noqa: RUF001
"""LLM-driven next-question generator.

The clarify loop tells us *which* field to ask about (by entropy /
must-have logic). This module asks the configured provider to phrase a
human-friendly question for that field, given what's already known.

A pure-Python fallback is provided so tests and offline runs don't
require a live endpoint — the fallback uses a stable lookup table
keyed by field name.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import NoProviderConfiguredError, first_provider
from app.providers.registry import ProviderRegistry

FALLBACK_QUESTIONS: dict[str, tuple[str, str]] = {
    "topic": ("What is the paper's topic? (one sentence)", "string"),
    "venue": ("Which venue / journal? (e.g. IEEE, ACM, CJC)", "string"),
    "length_pages": ("Target length in pages? (integer)", "integer"),
    "language": ("Language? ('en' or 'zh')", "string"),
    "author": ("Author name(s)?", "string"),
    "affiliation": ("Author affiliation(s)?", "string"),
    "objective": ("In one sentence, what's the paper's main objective?", "string"),
    "audience": (
        "Who is the target audience? (researchers, practitioners, ...)",
        "string",
    ),
    "key_contributions": (
        "List the key contributions (comma-separated, 2-4 items).",
        "list[string]",
    ),
}

FALLBACK_QUESTIONS_ZH: dict[str, str] = {
    "topic": "论文主题是什么？（一句话）",
    "venue": "目标会议 / 期刊？（例如 IEEE、ACM、CJC、Springer-LNCS、Nature）",
    "length_pages": "目标长度是多少页？（整数）",
    "language": "正文使用哪种语言？（en 或 zh）",
    "author": "作者姓名？",
    "affiliation": "作者单位？",
    "objective": "用一句话说明论文的主要目标。",
    "audience": "目标读者是谁？（研究者、从业者…）",
    "key_contributions": "列出主要贡献（逗号分隔，2-4 项）。",
}


def _has_cjk(s: object) -> bool:
    if not isinstance(s, str):
        return False
    return any("\u4e00" <= ch <= "\u9fff" for ch in s)


def _detect_language(known: dict[str, object]) -> str:
    """Pick 'Chinese' if the user's existing answers contain CJK, else 'English'."""
    explicit = str(known.get("language") or "").strip().lower()
    if explicit in {"zh", "zh-cn", "chinese", "中文"}:
        return "Chinese"
    if explicit in {"en", "english"}:
        return "English"
    if any(_has_cjk(v) for v in known.values()):
        return "Chinese"
    return "English"


@dataclass(frozen=True)
class QuestionOption:
    value: str
    label: str
    description: str = ""


@dataclass(frozen=True)
class GeneratedQuestion:
    field: str
    question: str
    expected_type: str
    source: str  # "llm" | "fallback"
    description: str = ""
    options: tuple[QuestionOption, ...] = ()
    allow_other: bool = True


# Per-field structured prompt schemas (Chinese-default, Copilot-AskUserQuestion
# style). Each schema produces a numbered choice list plus a short rationale,
# so the user can pick a number rather than typing free text.
FIELD_SCHEMAS: dict[str, dict[str, object]] = {
    "venue": {
        "question": "请选择目标会议 / 期刊",
        "description": "决定后续 LaTeX 模板与版式约束；不在列表里就直接输入名称或填 '其他'。",
        "options": [
            ("IEEE", "IEEE", "工科顶刊／会议通用 IEEEtran 双栏模板"),
            ("ACM", "ACM", "ACM acmart 单/双栏，适合 SIG 会议与 TOG/TOSEM 等"),
            ("CJC", "CJC（计算机学报）", "中文期刊样式，单栏，常用于国内顶刊投稿"),
            (
                "Springer-LNCS",
                "Springer LNCS",
                "Springer 会议论文集模板（如 ECCV、CAV 等）",
            ),
            ("Nature", "Nature", "Nature/Science 风格通讯文，单栏紧凑版式"),
        ],
        "allow_other": True,
    },
    "length_pages": {
        "question": "目标论文长度（页）",
        "description": "用于估算字数与章节配比。",
        "options": [
            ("4", "4 页（短文）", "workshop 短文 / extended abstract"),
            ("8", "8 页（会议）", "标准 IEEE/ACM 会议长文"),
            ("12", "12 页（期刊）", "中等规模期刊或长会议论文"),
            ("20", "20 页以上（综述）", "Survey / 大综述"),
        ],
        "allow_other": True,
    },
    "language": {
        "question": "正文使用的语言",
        "description": "影响 prompt 与生成文风。",
        "options": [
            ("zh", "中文", "中文论文，含中英文摘要"),
            ("en", "English", "全英文论文"),
        ],
        "allow_other": False,
    },
}


def _schema_question(field: str) -> GeneratedQuestion | None:
    schema = FIELD_SCHEMAS.get(field)
    if schema is None:
        return None
    raw_options = schema["options"]
    assert isinstance(raw_options, list)
    options_list = [
        QuestionOption(value=v, label=lab, description=d) for (v, lab, d) in raw_options
    ]
    options_list.append(
        QuestionOption(
            value="", label="跳过（用默认）", description="保留默认值，不再追问"
        )
    )
    options = tuple(options_list)
    expected = FALLBACK_QUESTIONS.get(field, ("", "string"))[1]
    return GeneratedQuestion(
        field=field,
        question=str(schema["question"]),
        description=str(schema.get("description") or ""),
        expected_type=expected,
        options=options,
        allow_other=bool(schema.get("allow_other", True)),
        source="schema",
    )


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


def _fallback(field: str, language: str = "English") -> GeneratedQuestion:
    q, t = FALLBACK_QUESTIONS.get(field, (f"Please provide {field}.", "string"))
    if language == "Chinese":
        q = FALLBACK_QUESTIONS_ZH.get(field, q)
    return GeneratedQuestion(
        field=field, question=q, expected_type=t, source="fallback"
    )


async def generate(
    *,
    field: str,
    known: dict[str, object],
    registry: ProviderRegistry | None,
    expected_type: str | None = None,
) -> GeneratedQuestion:
    """Return the next question to display for ``field``.

    Schema-driven fields (venue, length_pages, language) always return a
    structured choice list; other fields fall through to the LLM phraser
    or the static fallback.
    """
    schema_q = _schema_question(field)
    if schema_q is not None:
        return schema_q

    expected = expected_type or FALLBACK_QUESTIONS.get(field, ("", "string"))[1]
    language = _detect_language(known)

    if registry is None or len(registry) == 0:
        return _fallback(field, language=language)

    try:
        provider = first_provider(registry)
    except NoProviderConfiguredError:
        return _fallback(field, language=language)

    prompt = render(
        "next_question.j2",
        known={k: v for k, v in known.items() if v},
        field=field,
        expected_type=expected,
        language=language,
    )
    req = ChatRequest(
        messages=(ChatMessage(role="user", content=prompt),),
        model=provider._default_model,
        temperature=0.0,
        max_tokens=256,
        response_format={"type": "json_object"},
    )
    try:
        resp = await provider.chat(req)
        data = json.loads(_strip_code_fence(resp.content))
        question = str(data.get("question") or "").strip()
        if not question:
            return _fallback(field, language=language)
        return GeneratedQuestion(
            field=field,
            question=question,
            expected_type=str(data.get("expected_type") or expected),
            source="llm",
        )
    except Exception:
        return _fallback(field, language=language)
