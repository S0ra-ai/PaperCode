# SPDX-License-Identifier: MPL-2.0
"""`folio format ...` subcommands."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.core.formats import (
    TIERS,
    FormatSpec,
    forget,
    get,
    import_external,
    list_entries,
)
from app.core.formats.cache import _path_for  # internal but useful here


def _print(line: str = "") -> None:
    print(line)


def cmd_list(tier: str) -> int:
    tiers = TIERS if tier == "all" else (tier,)
    rows: list[tuple[str, str, str, str]] = []
    for t in tiers:
        for key, spec in list_entries(t):  # type: ignore[arg-type]
            extracted = spec.extracted_at.isoformat() if spec.extracted_at else "-"
            rows.append((t, key, spec.display_name, extracted))
    if not rows:
        _print("(no cached format specs)")
        return 0
    width_t = max(len(r[0]) for r in rows)
    width_k = max(len(r[1]) for r in rows)
    width_n = max(len(r[2]) for r in rows)
    for t, k, n, e in rows:
        _print(f"{t:<{width_t}}  {k:<{width_k}}  {n:<{width_n}}  {e}")
    return 0


def cmd_show(key: str, tier: str | None) -> int:
    if tier:
        path = _path_for(tier, key)  # type: ignore[arg-type]
        if not path.exists():
            print(f"not found: {tier}/{key}", file=sys.stderr)
            return 2
        _print(path.read_text(encoding="utf-8"))
        return 0
    # Probe in priority order.
    hit = get(custom_key=key, venue_label=key)
    if hit is None:
        print(f"not found: {key}", file=sys.stderr)
        return 2
    spec, _t = hit
    _print(spec.model_dump_json(indent=2))
    return 0


def cmd_refresh(key: str, tier: str) -> int:
    # M1 stub: refresh requires re-running FormatStage which needs a
    # source PDF or LLM context. The CLI only marks the entry as
    # eligible for refresh on next pipeline run by deleting it.
    if forget(tier=tier, key=key):  # type: ignore[arg-type]
        _print(
            f"removed {tier}/{key}; the next pipeline run that needs it will re-extract"
        )
        return 0
    print(f"nothing to refresh: {tier}/{key}", file=sys.stderr)
    return 2


def cmd_forget(key: str, tier: str) -> int:
    if forget(tier=tier, key=key):  # type: ignore[arg-type]
        _print(f"removed {tier}/{key} (and any historical .vN.json)")
        return 0
    print(f"nothing to remove: {tier}/{key}", file=sys.stderr)
    return 2


def cmd_import(path: str, key: str | None) -> int:
    src = Path(path)
    if not src.exists():
        print(f"no such file: {path}", file=sys.stderr)
        return 2
    target = import_external(src, key=key)
    _print(f"imported → {target}")
    return 0


def dispatch(args: argparse.Namespace) -> int:
    action = args.action
    if action == "list":
        return cmd_list(args.tier)
    if action == "show":
        return cmd_show(args.key, args.tier)
    if action == "refresh":
        return cmd_refresh(args.key, args.tier)
    if action == "forget":
        return cmd_forget(args.key, args.tier)
    if action == "import":
        return cmd_import(args.path, args.key)
    print(f"unknown format action: {action}", file=sys.stderr)
    return 2


# Keep the spec model importable here for future expansion.
__all__ = ["FormatSpec", "dispatch"]
