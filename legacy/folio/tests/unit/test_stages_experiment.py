# SPDX-License-Identifier: MPL-2.0
"""Tests for the CodeStage and ExperimentWriteStage.

Both stages need an LLM provider; we use a fake provider that returns
canned ``ChatResponse`` objects, plus an InMemoryRunner for the
sandbox. No real network, no Docker.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.contract import Capability, StageMessage
from app.core.formats import FormatSpec
from app.core.stages import code as code_stage
from app.core.stages import experiment_write as experiment_write_stage
from app.providers.base import ChatRequest, ChatResponse
from app.providers.registry import ProviderRegistry
from app.sandbox.runner import InMemoryRunner, RunResult


class _FakeProvider:
    def __init__(self, label: str, responses: list[str]) -> None:
        self.label = label
        self._responses = list(responses)
        self.capability = Capability(label=label, base_url="x", default_model="m")
        self.calls: list[ChatRequest] = []

    async def chat(self, req: ChatRequest) -> ChatResponse:
        self.calls.append(req)
        text = self._responses.pop(0)
        return ChatResponse(
            content=text,
            model=req.model,
            prompt_tokens=10,
            completion_tokens=20,
            raw={},
        )

    async def aclose(self) -> None:
        pass

    async def probe(self) -> Capability:  # pragma: no cover
        return self.capability


def _format_spec_payload() -> dict[str, object]:
    return FormatSpec(
        venue_label="generic",
        display_name="Generic",
        language="en",
    ).model_dump()


def _msg_with_outline(*, has_experiments: bool = True) -> StageMessage:
    sections = [{"name": "Introduction", "brief": "intro"}]
    if has_experiments:
        sections.append(
            {
                "name": "Experiments",
                "brief": "compare baselines on toy data",
                "kind": "experiments",
            }
        )
    return StageMessage(
        payload={
            "format_spec": _format_spec_payload(),
            "outline": {"title": "T", "sections": sections},
            "clarify": {"topic": "X", "objective": "Y", "language": "English"},
            "draft": {
                "title": "T",
                "sections": [
                    {"name": "Introduction", "text": "..."},
                    {"name": "Experiments", "text": "PLACEHOLDER"},
                ],
            },
        }
    )


def _registry(provider: _FakeProvider) -> ProviderRegistry:
    reg = ProviderRegistry()
    reg.register(provider)  # type: ignore[arg-type]
    return reg


# ----- CodeStage -----


@pytest.mark.asyncio
async def test_code_stage_runs_and_parses(tmp_path: Path) -> None:
    provider = _FakeProvider(
        "p", ["print('hi')\nprint('FOLIO_RESULT:: {\"metrics\": {\"a\": 1}}')"]
    )
    runner = InMemoryRunner(
        results=[RunResult(0, 'FOLIO_RESULT:: {"metrics": {"a": 1.0}}\n', "", 0.1)]
    )
    msg = _msg_with_outline()

    out = await code_stage.run(
        msg,
        registry=_registry(provider),
        runner=runner,
        workdir=tmp_path / "w",
    )
    exp = out.payload["experiment"]
    assert exp["status"] == "ok"
    assert exp["result"]["metrics"] == {"a": 1.0}
    assert exp["attempts"] == 1
    assert out.history[-1].stage == "code"
    assert out.history[-1].prompt_tokens == 10


@pytest.mark.asyncio
async def test_code_stage_skips_when_no_experiment_section(tmp_path: Path) -> None:
    provider = _FakeProvider("p", [])
    runner = InMemoryRunner(results=[])
    msg = _msg_with_outline(has_experiments=False)

    out = await code_stage.run(
        msg,
        registry=_registry(provider),
        runner=runner,
        workdir=tmp_path / "w",
    )
    assert "experiment" not in out.payload
    assert "skipping" in (out.history[-1].note or "")


@pytest.mark.asyncio
async def test_code_stage_strips_markdown_fences(tmp_path: Path) -> None:
    fenced = "```python\nprint('hi')\n```"
    provider = _FakeProvider("p", [fenced])
    runner = InMemoryRunner(
        results=[RunResult(0, 'FOLIO_RESULT:: {"metrics": {"a": 1}}\n', "", 0.1)]
    )
    out = await code_stage.run(
        _msg_with_outline(),
        registry=_registry(provider),
        runner=runner,
        workdir=tmp_path / "w",
    )
    assert out.payload["experiment"]["code"] == "print('hi')"


@pytest.mark.asyncio
async def test_code_stage_repairs_on_failure(tmp_path: Path) -> None:
    provider = _FakeProvider("p", ["bad code", "fixed code"])
    runner = InMemoryRunner(
        results=[
            RunResult(1, "", "boom\n", 0.1),
            RunResult(0, 'FOLIO_RESULT:: {"metrics": {"a": 0.5}}\n', "", 0.1),
        ]
    )
    out = await code_stage.run(
        _msg_with_outline(),
        registry=_registry(provider),
        runner=runner,
        workdir=tmp_path / "w",
        max_attempts=2,
    )
    assert out.payload["experiment"]["status"] == "ok"
    assert out.payload["experiment"]["attempts"] == 2
    assert out.payload["experiment"]["code"] == "fixed code"
    assert len(provider.calls) == 2  # initial + repair


# ----- ExperimentWriteStage -----


@pytest.mark.asyncio
async def test_experiment_write_replaces_section_text() -> None:
    msg = _msg_with_outline()
    new = msg.model_copy(deep=True)
    new.payload["experiment"] = {
        "section_name": "Experiments",
        "status": "ok",
        "result": {"metrics": {"acc": 0.9}, "extra": {}, "parsed_via": "marker"},
    }
    provider = _FakeProvider(
        "p", ["The model achieved an accuracy of 0.90 on the held-out split."]
    )

    out = await experiment_write_stage.run(new, registry=_registry(provider))
    sections = out.payload["draft"]["sections"]
    exp_section = next(s for s in sections if s["name"] == "Experiments")
    assert "0.90" in exp_section["text"]
    assert "PLACEHOLDER" not in exp_section["text"]


@pytest.mark.asyncio
async def test_experiment_write_skips_on_failed_status() -> None:
    msg = _msg_with_outline()
    new = msg.model_copy(deep=True)
    new.payload["experiment"] = {
        "status": "failed",
        "section_name": "Experiments",
        "result": {"metrics": {}},
    }
    provider = _FakeProvider("p", [])

    out = await experiment_write_stage.run(new, registry=_registry(provider))
    # Provider must not be called.
    assert provider.calls == []
    # Section text untouched.
    sections = out.payload["draft"]["sections"]
    exp_section = next(s for s in sections if s["name"] == "Experiments")
    assert exp_section["text"] == "PLACEHOLDER"
    assert "skipped" in (out.history[-1].note or "")


@pytest.mark.asyncio
async def test_experiment_write_skips_when_no_payload() -> None:
    provider = _FakeProvider("p", [])
    out = await experiment_write_stage.run(
        _msg_with_outline(), registry=_registry(provider)
    )
    assert provider.calls == []
    assert "no experiment payload" in (out.history[-1].note or "")
