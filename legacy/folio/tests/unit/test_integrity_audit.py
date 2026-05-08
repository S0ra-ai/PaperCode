# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path

from app.core.contract import StageMessage, StageRecord
from app.core.integrity.audit import AuditBundle, write_audit_zip


def _msg() -> StageMessage:
    msg = StageMessage(payload={"draft": {"sections": []}})
    return msg.with_record(
        StageRecord(
            stage="draft",
            started_at=datetime.now(UTC),
            finished_at=datetime.now(UTC),
            provider_label="p",
            model="m",
            prompt_tokens=100,
            completion_tokens=200,
            cost_usd=0.001,
            note="ok",
        )
    )


def test_write_audit_zip_basic(tmp_path: Path) -> None:
    out = tmp_path / "audit.zip"
    bundle = AuditBundle(message=_msg())
    p = write_audit_zip(bundle, out)
    assert p == out and p.exists()
    with zipfile.ZipFile(p) as zf:
        names = sorted(zf.namelist())
    assert names == ["manifest.json", "message.json"]


def test_audit_zip_includes_optional_artifacts(tmp_path: Path) -> None:
    out = tmp_path / "audit.zip"
    bundle = AuditBundle(
        message=_msg(),
        trace=[{"stage": "draft", "ok": True}, {"stage": "cite", "ok": True}],
        format_spec={"venue_label": "IEEE"},
        sources={"src/a": "alpha", "b": "beta"},
        flags={"plagiarism": [], "fact": []},
    )
    write_audit_zip(bundle, out)
    with zipfile.ZipFile(out) as zf:
        names = set(zf.namelist())
        assert {
            "manifest.json",
            "message.json",
            "trace.jsonl",
            "format_spec.json",
            "flags.json",
            "sources/src_a.txt",
            "sources/b.txt",
        } <= names
        trace = zf.read("trace.jsonl").decode("utf-8").splitlines()
        assert len(trace) == 2
        assert json.loads(trace[0])["stage"] == "draft"
        assert zf.read("sources/src_a.txt").decode("utf-8") == "alpha"


def test_audit_zip_is_deterministic(tmp_path: Path) -> None:
    msg = _msg()
    bundle = AuditBundle(
        message=msg,
        trace=[{"a": 1}],
        sources={"x": "hello"},
    )
    a = write_audit_zip(bundle, tmp_path / "a.zip")
    b = write_audit_zip(bundle, tmp_path / "b.zip")
    assert a.read_bytes() == b.read_bytes()


def test_manifest_contains_stage_history(tmp_path: Path) -> None:
    out = tmp_path / "audit.zip"
    write_audit_zip(AuditBundle(message=_msg()), out)
    with zipfile.ZipFile(out) as zf:
        manifest = json.loads(zf.read("manifest.json"))
    assert manifest["stages"][0]["stage"] == "draft"
    assert manifest["stages"][0]["prompt_tokens"] == 100
    assert manifest["run_id"]
