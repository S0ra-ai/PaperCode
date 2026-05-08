# SPDX-License-Identifier: MPL-2.0
"""IntentStage — classify free-form user input into a pipeline route.

Used by the TUI on launch to route a chat-style prompt
(e.g. "Write me a survey about LLMs in code generation, 8000 words, IEEE
format") to the right orchestrator (``run_sequential`` vs ``run_survey``)
with a seeded ``payload['clarify']`` so subsequent clarify rounds only ask
for genuinely missing fields.

Per AGENTS.md § 1.1 the TUI itself does **not** parse user prose; it
calls this stage and switches on the resulting intent.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel

from app.core.contract import StageMessage, StageRecord
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry

STAGE = "intent"

DEFAULT_SURVEY_WORDS = 18000


class IntentResult(BaseModel):
    intent: Literal["format_to_paper", "survey", "chat"] = "chat"
    topic: str = ""
    venue: str = ""
    length_words: int = 0
    language: str = "en"
    pdf_path: str = ""
    rationale: str = ""

    model_config = {"extra": "ignore"}


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[:-3]
    return s.strip()


_VENUE_PATTERNS = (
    ("IEEE", re.compile(r"\bieee\b", re.IGNORECASE)),
    ("ACM", re.compile(r"\bacm\b", re.IGNORECASE)),
    ("CJC", re.compile(r"\bcjc\b|计算机学报", re.IGNORECASE)),
    ("Springer-LNCS", re.compile(r"\blncs\b|springer", re.IGNORECASE)),
    ("Nature", re.compile(r"\bnature\b|自然", re.IGNORECASE)),
)


def _heuristic(raw_text: str) -> IntentResult:
    """Last-ditch classifier when the LLM returns garbage."""
    low = raw_text.lower()
    is_zh = any("\u4e00" <= ch <= "\u9fff" for ch in raw_text)
    survey_kw = ("综述", "review", "survey", "literature", "文献综述")
    intent: Literal["format_to_paper", "survey", "chat"]
    if any(k in low or k in raw_text for k in survey_kw):
        intent = "survey"
    else:
        intent = "format_to_paper"

    venue = ""
    for label, pat in _VENUE_PATTERNS:
        if pat.search(raw_text):
            venue = label
            break

    length_words = DEFAULT_SURVEY_WORDS if intent == "survey" else 6000
    m = re.search(r"(\d{3,6})\s*(字|words?|w\b)", raw_text, re.IGNORECASE)
    if m:
        length_words = int(m.group(1))

    return IntentResult(
        intent=intent,
        topic=raw_text.strip()[:200],
        venue=venue,
        length_words=length_words,
        language="zh" if is_zh else "en",
        rationale="heuristic-fallback",
    )


async def run(
    msg: StageMessage,
    *,
    raw_text: str,
    registry: ProviderRegistry,
    default_survey_words: int = DEFAULT_SURVEY_WORDS,
) -> StageMessage:
    """Classify ``raw_text`` and write the result to ``payload['intent']``.

    Also seeds ``payload['clarify']`` with the extracted fields so the
    existing clarify loop only asks for what's still missing.
    """
    started = datetime.now(UTC)
    provider = first_provider(registry)
    prompt = render("intent.j2", raw_text=raw_text, default_words=default_survey_words)
    req = ChatRequest(
        messages=(ChatMessage(role="user", content=prompt),),
        model=provider.capability.default_model,
        response_format={"type": "json_object"},
    )
    note = ""
    try:
        resp = await provider.chat(req)
        try:
            data = json.loads(_strip_code_fence(resp.content))
            result = IntentResult.model_validate(data)
            note = f"intent={result.intent} topic={result.topic[:60]!r}"
            prompt_tokens = resp.prompt_tokens
            completion_tokens = resp.completion_tokens
            model_name = resp.model
            provider_label: str | None = provider.label
        except (json.JSONDecodeError, ValueError):
            result = _heuristic(raw_text)
            note = f"intent={result.intent} (json-fallback)"
            prompt_tokens = resp.prompt_tokens
            completion_tokens = resp.completion_tokens
            model_name = resp.model
            provider_label = provider.label
    except Exception as exc:  # network / auth / etc — don't crash launch
        result = _heuristic(raw_text)
        note = f"intent={result.intent} (provider-error: {exc!r})"
        prompt_tokens = 0
        completion_tokens = 0
        model_name = None
        provider_label = None

    new = msg.model_copy(deep=True)
    # Overlay regex finds onto whatever the LLM returned — never let a
    # confident extraction get lost just because the LLM omitted a field.
    fallback = _heuristic(raw_text)
    if not result.venue and fallback.venue:
        result = result.model_copy(update={"venue": fallback.venue})
    if (
        (not result.length_words or result.length_words == 6000)
        and fallback.length_words
        and fallback.rationale == "heuristic-fallback"
    ):
        # Only override the LLM if the heuristic actually parsed a number
        # from the raw text (not the bare 6000 default).
        m = re.search(r"(\d{3,6})\s*(字|words?|w\b)", raw_text, re.IGNORECASE)
        if m:
            result = result.model_copy(update={"length_words": int(m.group(1))})
    new.payload["intent"] = result.model_dump()

    clarify = dict(new.payload.get("clarify") or {})
    if result.topic and not clarify.get("topic"):
        clarify["topic"] = result.topic
    if result.venue and not clarify.get("venue"):
        clarify["venue"] = result.venue
    if result.venue and not clarify.get("style"):
        clarify["style"] = _venue_to_style(result.venue)
    if result.language and not clarify.get("language"):
        clarify["language"] = result.language
    if result.length_words and not clarify.get("length_pages"):
        clarify["length_pages"] = max(4, result.length_words // 600)
    new.payload["clarify"] = clarify

    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        provider_label=provider_label,
        model=model_name,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        note=note,
    )
    return new.with_record(record)


def _venue_to_style(venue: str) -> str:
    v = venue.strip().lower()
    if "ieee" in v:
        return "ieee"
    if "acm" in v:
        return "acm"
    if "springer" in v or "lncs" in v:
        return "springer-lncs"
    if "cjc" in v or "中国计算机" in v or "中文" in v:
        return "cjc"
    return v or "ieee"
