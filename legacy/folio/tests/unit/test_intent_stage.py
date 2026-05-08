# SPDX-License-Identifier: MPL-2.0
"""Unit tests for the IntentStage."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.core.contract import Capability, StageMessage
from app.core.stages import intent as intent_stage
from app.providers.base import ChatRequest, ChatResponse, Provider
from app.providers.registry import ProviderRegistry


class _FakeProvider(Provider):
    def __init__(
        self, content: str = "", *, raise_exc: Exception | None = None
    ) -> None:
        self.label = "fake"
        self.capability = Capability(
            label="fake",
            base_url="http://x",
            default_model="fake-1",
            family="openai-compatible",
            supports_chat=True,
            supports_tools=False,
            supports_streaming=False,
            supports_long_context=False,
            cost_per_1k_in=0.0,
            cost_per_1k_out=0.0,
        )
        self._content = content
        self._raise = raise_exc

    async def chat(self, request: ChatRequest) -> ChatResponse:
        if self._raise is not None:
            raise self._raise
        return ChatResponse(
            content=self._content,
            model="fake-1",
            prompt_tokens=10,
            completion_tokens=20,
            raw={},
        )

    async def stream(
        self, request: ChatRequest
    ) -> AsyncIterator[str]:  # pragma: no cover
        if False:
            yield ""

    async def probe(self) -> Capability:  # pragma: no cover
        return self.capability


def _registry(p: Provider) -> ProviderRegistry:
    reg = ProviderRegistry()
    reg.register(p)
    return reg


def test_intent_llm_survey_zh_seeds_clarify() -> None:
    payload = (
        '{"intent":"survey","topic":"大语言模型在代码生成的应用",'
        '"venue":"IEEE","length_words":18000,"language":"zh",'
        '"pdf_path":"","rationale":"contains 综述"}'
    )
    reg = _registry(_FakeProvider(payload))

    async def go() -> StageMessage:
        return await intent_stage.run(
            StageMessage(), raw_text="帮我写一篇综述", registry=reg
        )

    msg = asyncio.run(go())
    assert msg.payload["intent"]["intent"] == "survey"
    assert msg.payload["clarify"]["topic"].startswith("大语言模型")
    assert msg.payload["clarify"]["style"] == "ieee"
    assert msg.payload["clarify"]["language"] == "zh"
    assert msg.payload["clarify"]["length_pages"] >= 4


def test_intent_llm_format_to_paper_with_pdf() -> None:
    payload = (
        '{"intent":"format_to_paper","topic":"transformers",'
        '"venue":"Springer-LNCS","length_words":6000,"language":"en",'
        '"pdf_path":"/tmp/x.pdf","rationale":""}'
    )
    reg = _registry(_FakeProvider(payload))

    async def go() -> StageMessage:
        return await intent_stage.run(
            StageMessage(), raw_text="write me a paper", registry=reg
        )

    msg = asyncio.run(go())
    assert msg.payload["intent"]["intent"] == "format_to_paper"
    assert msg.payload["intent"]["pdf_path"] == "/tmp/x.pdf"
    assert msg.payload["clarify"]["style"] == "springer-lncs"


def test_intent_provider_error_falls_back_to_heuristic_zh_survey() -> None:
    reg = _registry(_FakeProvider(raise_exc=RuntimeError("network down")))

    async def go() -> StageMessage:
        return await intent_stage.run(
            StageMessage(),
            raw_text="帮我做一篇关于扩散模型的综述论文",
            registry=reg,
        )

    msg = asyncio.run(go())
    assert msg.payload["intent"]["intent"] == "survey"
    assert msg.payload["intent"]["language"] == "zh"
    assert "heuristic-fallback" in msg.payload["intent"]["rationale"]


def test_intent_garbage_json_falls_back_to_heuristic() -> None:
    reg = _registry(_FakeProvider("not json at all"))

    async def go() -> StageMessage:
        return await intent_stage.run(
            StageMessage(), raw_text="write a paper about RAG", registry=reg
        )

    msg = asyncio.run(go())
    assert msg.payload["intent"]["intent"] == "format_to_paper"
    assert msg.payload["intent"]["language"] == "en"


def test_venue_to_style_mapper() -> None:
    assert intent_stage._venue_to_style("IEEE Trans. on X") == "ieee"
    assert intent_stage._venue_to_style("ACM SIGGRAPH") == "acm"
    assert intent_stage._venue_to_style("Springer LNCS") == "springer-lncs"
    assert intent_stage._venue_to_style("中国计算机学会") == "cjc"
    assert intent_stage._venue_to_style("") == "ieee"
