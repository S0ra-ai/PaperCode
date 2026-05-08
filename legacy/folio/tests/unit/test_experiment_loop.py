# SPDX-License-Identifier: MPL-2.0
"""Tests for app.core.experiment.loop."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.experiment.loop import run_experiment
from app.sandbox.runner import InMemoryRunner, RunResult


def _ok(stdout: str = 'FOLIO_RESULT:: {"metrics": {"acc": 0.9}}\n') -> RunResult:
    return RunResult(exit_code=0, stdout=stdout, stderr="", duration_s=0.1)


def _fail() -> RunResult:
    return RunResult(
        exit_code=1, stdout="", stderr="ZeroDivisionError\n", duration_s=0.1
    )


@pytest.mark.asyncio
async def test_first_attempt_success(tmp_path: Path) -> None:
    runner = InMemoryRunner(results=[_ok()])
    out = await run_experiment(
        initial_code="print('x')",
        runner=runner,
        workdir=tmp_path,
    )
    assert out.ok
    assert out.attempts == 1
    assert out.result.metrics == {"acc": 0.9}
    assert len(runner.calls) == 1


@pytest.mark.asyncio
async def test_autopilot_repairs_once(tmp_path: Path) -> None:
    runner = InMemoryRunner(results=[_fail(), _ok()])
    repaired: list[str] = []

    async def repair(code: str, _run: RunResult) -> str:
        repaired.append(code)
        return "print('fixed')"

    out = await run_experiment(
        initial_code="print('broken')",
        runner=runner,
        workdir=tmp_path,
        repair=repair,
        max_attempts=2,
    )
    assert out.ok
    assert out.attempts == 2
    assert out.code == "print('fixed')"
    assert len(repaired) == 1
    assert len(out.repair_log) == 1
    assert "exit=1" in out.repair_log[0]


@pytest.mark.asyncio
async def test_autopilot_gives_up_after_max(tmp_path: Path) -> None:
    runner = InMemoryRunner(results=[_fail(), _fail()])

    async def repair(code: str, _run: RunResult) -> str:
        return "still broken"

    out = await run_experiment(
        initial_code="x",
        runner=runner,
        workdir=tmp_path,
        repair=repair,
        max_attempts=2,
    )
    assert out.status == "failed"
    assert out.attempts == 2


@pytest.mark.asyncio
async def test_interactive_returns_after_first_failure(tmp_path: Path) -> None:
    runner = InMemoryRunner(results=[_fail()])

    async def repair(code: str, _run: RunResult) -> str:  # pragma: no cover
        raise AssertionError("repair must not be called in interactive mode")

    out = await run_experiment(
        initial_code="x",
        runner=runner,
        workdir=tmp_path,
        mode="interactive",
        repair=repair,
        max_attempts=5,
    )
    assert out.status == "needs_user"
    assert out.attempts == 1


@pytest.mark.asyncio
async def test_no_marker_in_stdout_counts_as_failure(tmp_path: Path) -> None:
    runner = InMemoryRunner(results=[RunResult(0, "noisy output\n", "", 0.1)])
    out = await run_experiment(
        initial_code="x",
        runner=runner,
        workdir=tmp_path,
        max_attempts=1,
    )
    assert out.status == "failed"
    assert out.result.parsed_via == "none"
