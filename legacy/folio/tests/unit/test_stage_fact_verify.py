# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

import pytest

from app.core.contract import Capability, StageMessage
from app.core.stages import fact_verify as fv
from app.providers.base import ChatRequest, ChatResponse
from app.providers.registry import ProviderRegistry


class _FakeProvider:
    def __init__(self, responses: list[str]) -> None:
        self.label = "fake"
        self.capability = Capability(label="fake", base_url="x", default_model="m")
        self._responses = list(responses)
        self.calls: list[ChatRequest] = []

    async def chat(self, req: ChatRequest) -> ChatResponse:
        self.calls.append(req)
        return ChatResponse(
            content=self._responses.pop(0),
            model=req.model,
            prompt_tokens=1,
            completion_tokens=1,
            raw={},
        )

    async def aclose(self) -> None: ...

    async def probe(self) -> Capability:  # pragma: no cover
        return self.capability


def _registry(p: _FakeProvider) -> ProviderRegistry:
    r = ProviderRegistry()
    r.register(p)  # type: ignore[arg-type]
    return r


def _msg(sections: list[dict[str, object]]) -> StageMessage:
    return StageMessage(
        payload={
            "draft": {"sections": sections},
            "citations": [],
        }
    )


@pytest.mark.asyncio
async def test_fact_verify_flags_unsupported_claims() -> None:
    sections = [
        {
            "name": "Method",
            "text": (
                "We adopt the transformer architecture \\cite{vaswani}. "
                "It outperforms BERT on every benchmark \\cite{vaswani}."
            ),
        }
    ]
    provider = _FakeProvider(
        [
            '{"supports": true, "reason": "ok"}',
            '{"supports": false, "reason": "source does not claim this"}',
        ]
    )
    out = await fv.run(
        _msg(sections),
        registry=_registry(provider),
        sources={"vaswani": "Attention is all you need. ..."},
    )
    flags = out.payload["fact_flags"]
    assert len(flags) == 1
    assert flags[0]["key"] == "vaswani"
    assert "every benchmark" in flags[0]["claim"]
    audit = out.payload["fact_audit"]
    assert audit["total_pairs"] == 2
    assert audit["flagged"] == 1


@pytest.mark.asyncio
async def test_fact_verify_skips_when_no_source() -> None:
    sections = [{"name": "Intro", "text": "Foo claims X \\cite{missing}."}]
    provider = _FakeProvider([])
    out = await fv.run(
        _msg(sections),
        registry=_registry(provider),
        sources={},
    )
    assert out.payload["fact_flags"] == []
    assert out.payload["fact_audit"]["skipped_no_source"] == 1
    assert provider.calls == []


@pytest.mark.asyncio
async def test_fact_verify_respects_sample_limit() -> None:
    sections = [
        {
            "name": "Sec",
            "text": " ".join(f"Claim {i} \\cite{{k{i}}}." for i in range(5)),
        }
    ]
    provider = _FakeProvider(['{"supports": true}'] * 3)
    sources = {f"k{i}": "evidence text" for i in range(5)}
    out = await fv.run(
        _msg(sections),
        registry=_registry(provider),
        sources=sources,
        sample_limit=3,
    )
    assert out.payload["fact_audit"]["sampled"] == 3
    assert out.payload["fact_audit"]["total_pairs"] == 5
    assert len(provider.calls) == 3


@pytest.mark.asyncio
async def test_fact_verify_tolerates_messy_json() -> None:
    sections = [{"name": "S", "text": "Foo \\cite{k}."}]
    provider = _FakeProvider(
        ['Sure! Here is JSON: {"supports": false, "reason": "no"}']
    )
    out = await fv.run(
        _msg(sections),
        registry=_registry(provider),
        sources={"k": "src"},
    )
    flags = out.payload["fact_flags"]
    assert len(flags) == 1
    assert flags[0]["reason"] == "no"


@pytest.mark.asyncio
async def test_fact_verify_unparseable_response_flags_pessimistically() -> None:
    sections = [{"name": "S", "text": "Bar \\cite{k}."}]
    provider = _FakeProvider(["I don't know"])
    out = await fv.run(
        _msg(sections),
        registry=_registry(provider),
        sources={"k": "src"},
    )
    flags = out.payload["fact_flags"]
    assert len(flags) == 1
    assert "unparseable" in flags[0]["reason"]
