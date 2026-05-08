# SPDX-License-Identifier: MPL-2.0
"""Experiment loop: code → sandbox → parse → optional repair.

Mode model
----------

* ``autopilot`` (default): on the first attempt we run the code, parse
  the result and return. If it fails (non-zero exit, no parsed result)
  the LLM is asked to patch the code with the stderr/stdout in hand,
  for at most ``max_attempts - 1`` extra tries. After that the loop
  returns the last outcome with ``status="failed"``.

* ``interactive``: never auto-repair. On the first failure the loop
  returns ``status="needs_user"`` so the TUI can surface logs and ask
  the human how to proceed.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from app.core.experiment.parse import ExperimentResult, parse
from app.sandbox import RunResult, SandboxRunner, SandboxSpec

Mode = Literal["autopilot", "interactive"]
RepairFn = Callable[[str, RunResult], Awaitable[str]]


@dataclass(frozen=True)
class LoopOutcome:
    code: str
    run: RunResult
    result: ExperimentResult
    attempts: int
    status: str  # "ok" | "failed" | "needs_user"
    repair_log: tuple[str, ...] = field(default_factory=tuple)

    @property
    def ok(self) -> bool:
        return self.status == "ok"


async def run_experiment(
    *,
    initial_code: str,
    runner: SandboxRunner,
    workdir: Path,
    mode: Mode = "autopilot",
    max_attempts: int = 2,
    repair: RepairFn | None = None,
    timeout_s: int = 120,
    mem_mb: int = 1024,
    data_dir: Path | None = None,
) -> LoopOutcome:
    code = initial_code
    repair_log: list[str] = []
    last: tuple[RunResult, ExperimentResult] | None = None

    for attempt in range(1, max_attempts + 1):
        spec = SandboxSpec(
            code=code,
            workdir=workdir,
            data_dir=data_dir,
            timeout_s=timeout_s,
            mem_mb=mem_mb,
        )
        run = await runner.run(spec)
        result = parse(run.stdout)
        last = (run, result)

        success = run.ok and result.parsed_via != "none"
        if success:
            return LoopOutcome(
                code=code,
                run=run,
                result=result,
                attempts=attempt,
                status="ok",
                repair_log=tuple(repair_log),
            )

        if mode == "interactive":
            return LoopOutcome(
                code=code,
                run=run,
                result=result,
                attempts=attempt,
                status="needs_user",
                repair_log=tuple(repair_log),
            )

        if attempt >= max_attempts or repair is None:
            break

        repair_log.append(_summarise_failure(run, result))
        new_code = await repair(code, run)
        if not isinstance(new_code, str) or not new_code.strip():
            break
        code = new_code

    assert last is not None
    run, result = last
    return LoopOutcome(
        code=code,
        run=run,
        result=result,
        attempts=max_attempts,
        status="failed",
        repair_log=tuple(repair_log),
    )


def _summarise_failure(run: RunResult, result: ExperimentResult) -> str:
    if run.timed_out:
        return f"timeout after {run.duration_s:.1f}s"
    if run.exit_code != 0:
        tail = run.stderr.strip().splitlines()[-3:]
        return f"exit={run.exit_code}: " + " | ".join(tail)
    if result.parsed_via == "none":
        return "ran but emitted no FOLIO_RESULT marker"
    return "unknown failure"
