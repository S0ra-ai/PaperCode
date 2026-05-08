# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

import argparse
import io
from pathlib import Path

from app.cli import init_cmd
from app.cli.main import _build_parser
from app.config import providers_store


def _ns(**kw: object) -> argparse.Namespace:
    base = {
        "label": None,
        "base_url": None,
        "default_model": None,
        "api_key": None,
        "headless": False,
        "force": False,
    }
    base.update(kw)
    return argparse.Namespace(**base)


def test_init_headless_creates_endpoint(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("FOLIO_HOME", str(tmp_path))
    out = io.StringIO()
    rc = init_cmd.dispatch(
        _ns(
            label="dev",
            base_url="https://api.example.com/v1",
            default_model="gpt-4o-mini",
            api_key="sk-test",
            headless=True,
        ),
        stdout=out,
    )
    assert rc == 0
    assert "registered endpoint 'dev'" in out.getvalue()
    eps = providers_store.list_all()
    assert any(e.label == "dev" and e.base_url.endswith("/v1") for e in eps)


def test_init_headless_missing_args_returns_2(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("FOLIO_HOME", str(tmp_path))
    out = io.StringIO()
    rc = init_cmd.dispatch(_ns(headless=True), stdout=out)
    assert rc == 2
    assert "headless init requires" in out.getvalue()


def test_init_refuses_overwrite_without_force(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("FOLIO_HOME", str(tmp_path))
    args = _ns(
        label="x",
        base_url="https://x/v1",
        default_model="m",
        api_key="k",
        headless=True,
    )
    init_cmd.dispatch(args, stdout=io.StringIO())
    out = io.StringIO()
    rc = init_cmd.dispatch(args, stdout=out)
    assert rc == 1
    assert "already exists" in out.getvalue()


def test_init_force_overwrites(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("FOLIO_HOME", str(tmp_path))
    args = _ns(
        label="x",
        base_url="https://a/v1",
        default_model="m1",
        api_key="k",
        headless=True,
    )
    init_cmd.dispatch(args, stdout=io.StringIO())
    args.base_url = "https://b/v1"
    args.default_model = "m2"
    args.force = True
    rc = init_cmd.dispatch(args, stdout=io.StringIO())
    assert rc == 0
    [ep] = [e for e in providers_store.list_all() if e.label == "x"]
    assert ep.base_url == "https://b/v1"
    assert ep.default_model == "m2"


def test_init_interactive_prompts(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("FOLIO_HOME", str(tmp_path))
    out = io.StringIO()
    in_ = io.StringIO("local\nhttps://localhost:1234/v1\nllama3\nsk-x\n")
    rc = init_cmd.dispatch(_ns(), stdout=out, stdin=in_)
    assert rc == 0
    eps = providers_store.list_all()
    assert any(e.label == "local" for e in eps)


def test_main_parser_includes_init_subcommand() -> None:
    p = _build_parser()
    # argparse exposes choices via the subparsers action.
    actions = [a for a in p._actions if isinstance(a, argparse._SubParsersAction)]
    assert actions, "no subparsers action found"
    assert "init" in actions[0].choices
    assert "format" in actions[0].choices
