# SPDX-License-Identifier: MPL-2.0
# ruff: noqa: RUF002
"""Unit tests for export_pdf backend selection (no actual compile)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.stages import export_pdf


def test_default_chain_order() -> None:
    chain = export_pdf._resolve_backends()
    assert chain[0] == "tectonic"
    assert "latexmk" in chain
    assert "xelatex" in chain
    assert "pdflatex" in chain
    assert "lualatex" in chain
    assert chain[-1] == "docker-tectonic"


def test_env_override_promotes_engine(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FOLIO_LATEX_ENGINE", "xelatex")
    chain = export_pdf._resolve_backends()
    assert chain[0] == "xelatex"
    # 其余仍作为 fallback。
    assert "tectonic" in chain[1:]
    assert "pdflatex" in chain[1:]


def test_env_override_unknown_still_first(monkeypatch: pytest.MonkeyPatch) -> None:
    """显式设置一个未知后端时，它会被置首并由 _backend_command 返回 None 跳过。"""
    monkeypatch.setenv("FOLIO_LATEX_ENGINE", "magictex")
    chain = export_pdf._resolve_backends()
    assert chain[0] == "magictex"


def test_backend_command_returns_none_when_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(export_pdf.shutil, "which", lambda _name: None)
    monkeypatch.setattr(export_pdf.tectonic_installer, "discover", lambda: None)
    for name in (
        "tectonic",
        "latexmk",
        "xelatex",
        "pdflatex",
        "lualatex",
        "docker-tectonic",
    ):
        assert export_pdf._backend_command(name, "p.tex", Path(".")) is None


def test_backend_command_xelatex_argv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        export_pdf.shutil,
        "which",
        lambda name: "/u/bin/xelatex" if name == "xelatex" else None,
    )
    cmd = export_pdf._backend_command("xelatex", "paper.tex", Path("."))
    assert cmd is not None
    assert cmd[0] == "xelatex"
    assert "paper.tex" in cmd
    assert "-interaction=nonstopmode" in cmd


def test_backend_command_latexmk_uses_xelatex(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        export_pdf.shutil,
        "which",
        lambda name: "/u/bin/latexmk" if name == "latexmk" else None,
    )
    cmd = export_pdf._backend_command("latexmk", "paper.tex", Path("."))
    assert cmd is not None
    assert "-xelatex" in cmd


def test_backend_command_docker_argv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        export_pdf.shutil,
        "which",
        lambda name: "/u/bin/docker" if name == "docker" else None,
    )
    work = Path("/tmp/work")
    cmd = export_pdf._backend_command("docker-tectonic", "paper.tex", work)
    assert cmd is not None
    assert cmd[0] == "docker"
    assert "tectonictypesetting/tectonic" in cmd
    assert f"{work}:/work" in cmd
