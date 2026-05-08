# SPDX-License-Identifier: MPL-2.0
"""End-user CLI smoke tests.

These exist to catch the kind of regression that 187 unit tests can
miss: a routing bug in ``app/__main__.py`` or ``app/cli/main.py`` that
causes ``folio init`` to fall through to the TUI and hang. We do NOT
launch the TUI here; we only assert that ``--help`` and read-only
subcommands exit cleanly with rc=0 and print the expected anchors.
"""

from __future__ import annotations

import subprocess
import sys

import pytest


def _run(
    *args: str, env_extra: dict[str, str] | None = None
) -> subprocess.CompletedProcess[str]:
    import os

    env = os.environ.copy()
    if env_extra:
        env.update(env_extra)
    return subprocess.run(
        [sys.executable, "-m", "app", *args],
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )


def test_top_level_help() -> None:
    cp = _run("--help")
    assert cp.returncode == 0, cp.stderr
    assert "folio" in cp.stdout
    assert "{init,survey,resume,format}" in cp.stdout
    assert "--pdf" in cp.stdout
    assert "--hello" in cp.stdout


def test_init_help() -> None:
    cp = _run("init", "--help")
    assert cp.returncode == 0, cp.stderr
    assert "--headless" in cp.stdout
    assert "--api-key" in cp.stdout


def test_resume_help() -> None:
    cp = _run("resume", "--help")
    assert cp.returncode == 0, cp.stderr
    assert "prefix" in cp.stdout
    assert "--list" in cp.stdout


def test_resume_list_empty(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    folio_home = tmp_path / "folio_home"
    folio_home.mkdir()
    cp = _run("resume", "--list", env_extra={"FOLIO_HOME": str(folio_home)})
    assert cp.returncode == 0, cp.stderr
    assert "no runs" in cp.stdout


def test_format_help() -> None:
    cp = _run("format", "--help")
    assert cp.returncode == 0, cp.stderr
    assert "list" in cp.stdout
    assert "show" in cp.stdout


def test_format_list_runs(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    folio_home = tmp_path / "folio_home"
    folio_home.mkdir()
    cp = _run("format", "list", env_extra={"FOLIO_HOME": str(folio_home)})
    assert cp.returncode == 0, cp.stderr
    assert "builtin" in cp.stdout
    assert "IEEE" in cp.stdout
