# SPDX-License-Identifier: MPL-2.0
"""CodeStage — generate experiment code with the LLM and run it in a sandbox.

Pipeline:
1. Pick the first outline section whose ``kind == "experiments"`` (or
   the section literally named "Experiments" / "实验"). If none, this
   stage is a no-op.
2. Render ``code_experiment.j2`` and call the LLM to draft a Python
   script.
3. Hand it to ``run_experiment`` from ``app.core.experiment.loop`` with
   the configured runner, repair callback, and mode.
4. Park the result on ``payload["experiment"]`` for the
   ``ExperimentWriteStage`` consumer.

Per AGENTS.md § 6 the LLM-generated code never runs outside this
sandbox path. The runner is injected so tests can use ``InMemoryRunner``.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.core.contract import StageMessage, StageRecord
from app.core.experiment import LoopOutcome, run_experiment
from app.core.prompts import render
from app.providers.base import ChatMessage, ChatRequest, ChatResponse
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry
from app.sandbox import RunResult, SandboxRunner

STAGE = "code"

EXPERIMENT_KEYWORDS = ("experiment", "experiments", "实验")


def _pick_experiment_section(outline: dict[str, Any]) -> dict[str, Any] | None:
    for section in outline.get("sections", []):
        if not isinstance(section, dict):
            continue
        kind = str(section.get("kind", "")).lower()
        name = str(section.get("name", "")).lower()
        if kind == "experiments" or any(kw in name for kw in EXPERIMENT_KEYWORDS):
            return section
    return None


def _strip_code_fence(text: str) -> str:
    out = text.strip()
    if out.startswith("```"):
        lines = out.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        out = "\n".join(lines)
    return out.strip()


async def run(
    msg: StageMessage,
    *,
    registry: ProviderRegistry,
    runner: SandboxRunner,
    workdir: Path,
    mode: str = "autopilot",
    max_attempts: int = 2,
    timeout_s: int = 120,
    mem_mb: int = 1024,
    data_dir: Path | None = None,
) -> StageMessage:
    started = datetime.now(UTC)
    outline = msg.payload.get("outline", {})
    section = _pick_experiment_section(outline)
    if section is None:
        record = StageRecord(
            stage=STAGE,
            started_at=started,
            finished_at=datetime.now(UTC),
            note="no experiments section in outline; skipping",
        )
        return msg.with_record(record)

    clarify = msg.payload.get("clarify", {})
    topic = clarify.get("topic", "(unspecified)")
    objective = clarify.get("objective", "")
    language = clarify.get("language", "English")

    provider = first_provider(registry)

    initial_prompt = render(
        "code_experiment.j2",
        topic=topic,
        objective=objective,
        section=section,
        timeout_s=timeout_s,
        mem_mb=mem_mb,
        language=language,
    )
    first = await provider.chat(
        ChatRequest(
            messages=(ChatMessage(role="user", content=initial_prompt),),
            model=provider.capability.default_model,
        )
    )
    initial_code = _strip_code_fence(first.content)
    p_tokens = first.prompt_tokens
    c_tokens = first.completion_tokens

    async def repair_cb(code: str, run_res: RunResult) -> str:
        nonlocal p_tokens, c_tokens
        prompt = render(
            "code_repair.j2",
            code=code,
            stderr_tail="\n".join(run_res.stderr.splitlines()[-30:]),
            stdout_tail="\n".join(run_res.stdout.splitlines()[-30:]),
            exit_code=run_res.exit_code,
            timed_out=run_res.timed_out,
            language=language,
        )
        resp: ChatResponse = await provider.chat(
            ChatRequest(
                messages=(ChatMessage(role="user", content=prompt),),
                model=provider.capability.default_model,
            )
        )
        p_tokens += resp.prompt_tokens
        c_tokens += resp.completion_tokens
        return _strip_code_fence(resp.content)

    workdir.mkdir(parents=True, exist_ok=True)
    outcome: LoopOutcome = await run_experiment(
        initial_code=initial_code,
        runner=runner,
        workdir=workdir,
        mode="interactive" if mode == "interactive" else "autopilot",
        max_attempts=max_attempts,
        repair=repair_cb,
        timeout_s=timeout_s,
        mem_mb=mem_mb,
        data_dir=data_dir,
    )

    new = msg.model_copy(deep=True)
    new.payload["experiment"] = {
        "section_name": section.get("name"),
        "status": outcome.status,
        "attempts": outcome.attempts,
        "code": outcome.code,
        "stdout_tail": "\n".join(outcome.run.stdout.splitlines()[-50:]),
        "stderr_tail": "\n".join(outcome.run.stderr.splitlines()[-50:]),
        "exit_code": outcome.run.exit_code,
        "timed_out": outcome.run.timed_out,
        "duration_s": outcome.run.duration_s,
        "result": outcome.result.as_payload(),
        "repair_log": list(outcome.repair_log),
    }
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        provider_label=provider.label,
        model=provider.capability.default_model,
        prompt_tokens=p_tokens,
        completion_tokens=c_tokens,
        note=f"experiment {outcome.status} after {outcome.attempts} attempt(s)",
    )
    return new.with_record(record)
