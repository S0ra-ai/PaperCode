# SPDX-License-Identifier: MPL-2.0
"""`folio format ...` CLI subcommand smoke test."""

from __future__ import annotations

import io
import json
from contextlib import redirect_stdout
from pathlib import Path

from app.cli.main import run as cli_run


def test_format_list_returns_zero(_isolate_folio_home: Path) -> None:
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = cli_run(["format", "list", "builtin"])
    assert rc == 0
    out = buf.getvalue()
    assert "IEEE" in out


def test_format_show_builtin(_isolate_folio_home: Path) -> None:
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = cli_run(["format", "show", "IEEE", "--tier", "builtin"])
    assert rc == 0
    data = json.loads(buf.getvalue())
    assert data["venue_label"] == "IEEE"


def test_format_import_round_trip(tmp_path: Path, _isolate_folio_home: Path) -> None:
    src = tmp_path / "mine.json"
    src.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "venue_label": "Mine",
                "display_name": "My Custom",
                "language": "en",
            }
        )
    )
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = cli_run(["format", "import", str(src), "--key", "mine"])
    assert rc == 0
    assert "imported" in buf.getvalue()
    # Then list shows it under custom.
    buf2 = io.StringIO()
    with redirect_stdout(buf2):
        cli_run(["format", "list", "custom"])
    assert "mine" in buf2.getvalue()
