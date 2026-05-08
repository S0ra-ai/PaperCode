# SPDX-License-Identifier: MPL-2.0
"""`folio resume [<uuid_prefix>]` subcommand.

Lists recent runs (``folio resume`` / ``folio resume --list``) or
continues a partially-completed run from its last checkpoint
(``folio resume <prefix>``). Resume is Copilot-style: pass any unique
prefix of a run's UUID and Folio loads the latest ``StageMessage``
snapshot from ``~/.folio/runs/<uuid>/checkpoints/`` then re-enters the
orchestrator with ``start_after=<last_stage>``.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import sys
from pathlib import Path

from app.config.loader import load as load_config
from app.config.survey import load as load_survey_config
from app.core.orchestrator import run_sequential, run_survey
from app.persistence import snapshots
from app.persistence.snapshot_runner import snapshotted
from app.providers.factory import build_registry


def add_subparser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser(
        "resume",
        help="resume a previously-interrupted run, or list recent runs",
    )
    p.add_argument(
        "prefix",
        nargs="?",
        default="",
        help="any prefix of a run UUID (omit to list recent runs)",
    )
    p.add_argument(
        "--list",
        action="store_true",
        dest="list_only",
        help="just print recent runs and exit",
    )
    p.add_argument(
        "--limit",
        type=int,
        default=10,
        help="max runs to show in --list (default: 10)",
    )
    p.add_argument(
        "--pdf",
        type=Path,
        default=None,
        help="(format_to_paper only) PDF to use if format stage was skipped",
    )
    p.add_argument(
        "--no-pdf-export",
        action="store_true",
        help="skip PDF export on resume (tectonic)",
    )
    p.add_argument(
        "--no-docx-export",
        action="store_true",
        help="skip DOCX export on resume (pandoc)",
    )


def _print_table(rows: list[snapshots.RunSummary]) -> None:
    if not rows:
        print("(no runs found in ~/.folio/runs)")
        return
    print(
        f"{'uuid':<10}  {'kind':<16}  {'last_stage':<18}  {'status':<12}  "
        f"{'updated':<19}  topic"
    )
    print("-" * 100)
    for r in rows:
        short = r.run_id[:8]
        when = r.last_at.strftime("%Y-%m-%d %H:%M:%S")
        topic = (r.topic or "")[:50]
        print(
            f"{short:<10}  {r.kind:<16}  {r.last_stage:<18}  {r.status:<12}  "
            f"{when:<19}  {topic}"
        )


async def _resume(args: argparse.Namespace, summary: snapshots.RunSummary) -> int:
    config = load_config()
    if not config.endpoints:
        print(
            "no endpoint configured; run `folio init` or set FOLIO_LLM_ENDPOINTS",
            file=sys.stderr,
        )
        return 2
    registry = build_registry(config)
    msg = snapshots.load_message(summary.run_id)
    print(
        f"resuming {summary.run_id[:8]} ({summary.kind}) — "
        f"last completed: {summary.last_stage}"
    )
    try:
        if summary.kind == "format_to_paper":
            stream = run_sequential(
                msg,
                pdf_path=args.pdf,
                registry=registry,
                start_after=summary.last_stage,
            )
        else:
            stream = run_survey(
                msg,
                registry=registry,
                config=load_survey_config(),
                skip_export_pdf=args.no_pdf_export,
                skip_export_docx=args.no_docx_export,
                start_after=summary.last_stage,
            )
        async for upd, event in snapshotted(
            stream, kind=summary.kind, topic=summary.topic
        ):
            if event.status == "finished":
                print(f"[{event.stage}] {event.detail}")
            msg = upd
    finally:
        for p in registry:
            with contextlib.suppress(Exception):
                await p.aclose()
    exports = msg.payload.get("exports", {})
    if exports.get("dir"):
        print(f"\nwritten to: {exports['dir']}")
    return 0


def dispatch(args: argparse.Namespace) -> int:
    if args.list_only or not args.prefix:
        _print_table(snapshots.list_runs(limit=args.limit))
        return 0
    matches = snapshots.find_by_prefix(args.prefix)
    if not matches:
        print(f"no run matches prefix {args.prefix!r}", file=sys.stderr)
        return 1
    if len(matches) > 1:
        print(
            f"prefix {args.prefix!r} is ambiguous ({len(matches)} matches):",
            file=sys.stderr,
        )
        _print_table(matches)
        return 1
    return asyncio.run(_resume(args, matches[0]))


__all__ = ["add_subparser", "dispatch"]
