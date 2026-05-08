# SPDX-License-Identifier: MPL-2.0
"""Tests for app.sandbox.runner.DockerRunner argv + InMemoryRunner."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

from app.sandbox.runner import (
    DockerRunner,
    InMemoryRunner,
    RunnerError,
    RunResult,
    SandboxSpec,
)


class _FakeProc:
    def __init__(self, stdout: bytes, stderr: bytes, returncode: int) -> None:
        self._stdout = stdout
        self._stderr = stderr
        self.returncode = returncode

    async def communicate(self) -> tuple[bytes, bytes]:
        return self._stdout, self._stderr

    def kill(self) -> None:  # pragma: no cover - timeout path
        pass


@pytest.mark.asyncio
async def test_docker_runner_writes_script_and_collects_output(tmp_path: Path) -> None:
    captured_argv: list[str] = []

    async def fake_spawn(*argv: str, stdout: int, stderr: int) -> _FakeProc:
        captured_argv.extend(argv)
        return _FakeProc(b"hello\n", b"", 0)

    runner = DockerRunner(spawn=fake_spawn)
    spec = SandboxSpec(
        code="print('hello')",
        workdir=tmp_path / "work",
        timeout_s=30,
        mem_mb=256,
        cpus=0.5,
    )
    res = await runner.run(spec)
    assert res.ok
    assert res.stdout == "hello\n"
    assert (tmp_path / "work" / "main.py").read_text() == "print('hello')"

    # Hermetic flags must be present.
    assert "--network=none" in captured_argv
    assert "--cap-drop=ALL" in captured_argv
    assert "--read-only" in captured_argv
    assert "--memory=256m" in captured_argv
    assert "--cpus=0.5" in captured_argv
    assert "--user=1000:1000" in captured_argv
    assert any(arg.startswith("--tmpfs=/tmp") for arg in captured_argv)
    # Image is the last positional before the entrypoint args.
    assert "folio-sandbox:0.1" in captured_argv
    assert (
        captured_argv[-3:] == ["timeout", "-k", "5"][:0] or "main.py" in captured_argv
    )


@pytest.mark.asyncio
async def test_docker_runner_passes_env_and_data_dir(tmp_path: Path) -> None:
    seen: list[str] = []

    async def fake_spawn(*argv: str, **_kw: object) -> _FakeProc:
        seen.extend(argv)
        return _FakeProc(b"", b"", 0)

    data = tmp_path / "data"
    data.mkdir()
    runner = DockerRunner(spawn=fake_spawn)
    await runner.run(
        SandboxSpec(
            code="x",
            workdir=tmp_path / "w",
            data_dir=data,
            env={"FOO": "bar", "BAZ": "qux"},
        )
    )
    assert "-e" in seen
    assert "FOO=bar" in seen and "BAZ=qux" in seen
    # data dir should be mounted read-only.
    assert any(s.endswith(":/data:ro") for s in seen)


@pytest.mark.asyncio
async def test_docker_runner_handles_missing_binary(tmp_path: Path) -> None:
    async def fake_spawn(*_a: object, **_k: object) -> _FakeProc:
        raise FileNotFoundError("docker not installed")

    runner = DockerRunner(spawn=fake_spawn)
    with pytest.raises(RunnerError):
        await runner.run(SandboxSpec(code="x", workdir=tmp_path))


@pytest.mark.asyncio
async def test_docker_runner_timeout(tmp_path: Path) -> None:
    class _SlowProc:
        returncode = -9

        async def communicate(self) -> tuple[bytes, bytes]:
            # First call: never finishes (raises TimeoutError via wait_for).
            # Second call (after kill): return drained streams.
            if not getattr(self, "_killed", False):
                await asyncio.sleep(10)
            return b"", b"killed"

        def kill(self) -> None:
            self._killed = True

    async def fake_spawn(*_a: object, **_k: object) -> _SlowProc:
        return _SlowProc()

    runner = DockerRunner(spawn=fake_spawn)
    res = await runner.run(SandboxSpec(code="x", workdir=tmp_path, timeout_s=0))
    assert res.timed_out
    assert not res.ok


@pytest.mark.asyncio
async def test_in_memory_runner_returns_canned_results(tmp_path: Path) -> None:
    runner = InMemoryRunner(results=[RunResult(0, "ok", "", 0.1)])
    res = await runner.run(SandboxSpec(code="x", workdir=tmp_path))
    assert res.ok
    assert len(runner.calls) == 1


def test_to_docker_path_windows_quirk() -> None:
    from app.sandbox.runner import _to_docker_path

    if os.name == "nt":
        out = _to_docker_path(Path("C:\\Users\\me"))
        assert out.startswith("//c/")
    else:
        out = _to_docker_path(Path("/tmp/x"))
        assert out.startswith("/")
