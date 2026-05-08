# SPDX-License-Identifier: MPL-2.0
"""Parse experiment outputs into a structured `ExperimentResult`.

Convention: experiment code prints a single JSON object on a line that
*starts* with ``FOLIO_RESULT::`` to stdout. We pick the **last**
matching line so progress chatter or re-runs don't trip us up.

If no marker is found we fall back to the last balanced JSON-object
block in stdout. ``parsed_via`` records which path produced the result.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

RESULT_MARKER = "FOLIO_RESULT::"


@dataclass(frozen=True)
class ExperimentResult:
    metrics: dict[str, float] = field(default_factory=dict)
    extra: dict[str, Any] = field(default_factory=dict)
    raw: str = ""
    parsed_via: str = "marker"  # "marker" | "fallback" | "none"

    def as_payload(self) -> dict[str, Any]:
        return {
            "metrics": dict(self.metrics),
            "extra": dict(self.extra),
            "parsed_via": self.parsed_via,
        }


_JSON_BLOCK = re.compile(r"\{[^{}]*\}")


def parse(stdout: str) -> ExperimentResult:
    obj = _scan_marker(stdout)
    if obj is not None:
        return _from_obj(obj, raw=stdout, via="marker")

    obj = _scan_fallback(stdout)
    if obj is not None:
        return _from_obj(obj, raw=stdout, via="fallback")

    return ExperimentResult(raw=stdout, parsed_via="none")


def _scan_marker(stdout: str) -> dict[str, Any] | None:
    last: dict[str, Any] | None = None
    for line in stdout.splitlines():
        idx = line.find(RESULT_MARKER)
        if idx < 0:
            continue
        rest = line[idx + len(RESULT_MARKER) :].strip()
        try:
            obj = json.loads(rest)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            last = obj
    return last


def _scan_fallback(stdout: str) -> dict[str, Any] | None:
    matches = _JSON_BLOCK.findall(stdout)
    for chunk in reversed(matches):
        try:
            obj = json.loads(chunk)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            return obj
    return None


def _from_obj(obj: dict[str, Any], *, raw: str, via: str) -> ExperimentResult:
    metrics: dict[str, float] = {}
    extra: dict[str, Any] = {}
    has_nested = isinstance(obj.get("metrics"), dict)
    src = obj["metrics"] if has_nested else obj
    for k, v in src.items():
        try:
            metrics[str(k)] = float(v)
        except (TypeError, ValueError):
            extra[str(k)] = v
    if has_nested:
        for k, v in obj.items():
            if k == "metrics":
                continue
            extra[str(k)] = v
    return ExperimentResult(metrics=metrics, extra=extra, raw=raw, parsed_via=via)
