# SPDX-License-Identifier: MPL-2.0
"""Trace JSONL writer tests."""

from __future__ import annotations

import json
from pathlib import Path

from app.observability.trace import TraceEvent, write


def test_write_appends_jsonl(_isolate_folio_home: Path) -> None:
    ev = TraceEvent(run_id="r1", stage="draft", note="ok")
    write(ev)
    write(TraceEvent(run_id="r1", stage="cite"))

    files = list((_isolate_folio_home / "trace").glob("*.jsonl"))
    assert len(files) == 1
    lines = files[0].read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    parsed = [json.loads(line) for line in lines]
    assert {row["stage"] for row in parsed} == {"draft", "cite"}
