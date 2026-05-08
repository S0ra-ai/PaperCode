# SPDX-License-Identifier: MPL-2.0
"""Audit-bundle export: produce a single deterministic ``audit.zip``."""

from __future__ import annotations

import json
import zipfile
from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.contract import StageMessage


@dataclass(frozen=True)
class AuditBundle:
    message: StageMessage
    trace: list[Mapping[str, Any]] = field(default_factory=list)
    format_spec: Mapping[str, Any] | None = None
    sources: Mapping[str, str] = field(default_factory=dict)
    flags: Mapping[str, Any] = field(default_factory=dict)


_FIXED_DATE = (2020, 1, 1, 0, 0, 0)


def _add(zf: zipfile.ZipFile, name: str, data: str | bytes) -> None:
    info = zipfile.ZipInfo(filename=name, date_time=_FIXED_DATE)
    info.compress_type = zipfile.ZIP_DEFLATED
    payload = data.encode("utf-8") if isinstance(data, str) else data
    zf.writestr(info, payload)


def _manifest(message: StageMessage) -> dict[str, Any]:
    return {
        "run_id": message.run_id,
        "created_at": message.created_at.isoformat(),
        "stages": [
            {
                "stage": r.stage,
                "started_at": r.started_at.isoformat(),
                "finished_at": r.finished_at.isoformat(),
                "provider": r.provider_label,
                "model": r.model,
                "prompt_tokens": r.prompt_tokens,
                "completion_tokens": r.completion_tokens,
                "cost_usd": r.cost_usd,
                "note": r.note,
            }
            for r in message.history
        ],
    }


def write_audit_zip(bundle: AuditBundle, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    entries: list[tuple[str, str | bytes]] = [
        ("manifest.json", json.dumps(_manifest(bundle.message), indent=2)),
        ("message.json", bundle.message.model_dump_json(indent=2)),
    ]
    if bundle.trace:
        lines = "\n".join(json.dumps(r, sort_keys=True) for r in bundle.trace)
        entries.append(("trace.jsonl", lines + "\n"))
    if bundle.format_spec is not None:
        entries.append(("format_spec.json", json.dumps(bundle.format_spec, indent=2)))
    if bundle.flags:
        entries.append(("flags.json", json.dumps(bundle.flags, indent=2)))
    for sid in sorted(bundle.sources):
        safe = sid.replace("/", "_").replace("\\", "_")
        entries.append((f"sources/{safe}.txt", bundle.sources[sid]))

    entries.sort(key=lambda kv: kv[0])
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries:
            _add(zf, name, data)
    return out_path
