# SPDX-License-Identifier: MPL-2.0
"""`folio survey <domain>` subcommand.

Drives ``app.core.orchestrator.survey.run`` from a clarified
``DomainSpec`` built from CLI flags. Uses the endpoint registry
configured by ``folio init``. Writes outputs into
``--output-dir`` or defaults to ``~/.folio/runs/<run_id>``.

The command exits non-zero if ``VerifyRefsStage`` fails
(``VerificationError``). Set ``FOLIO_VERIFY_LENIENT=1`` to turn
that into a warning (same semantics as the M1 pipeline).
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import sys
from pathlib import Path

from app.config.loader import load as load_config
from app.config.survey import load as load_survey_config
from app.core.contract import StageMessage
from app.core.orchestrator import run_survey
from app.persistence.snapshot_runner import snapshotted
from app.providers.factory import build_registry


def add_subparser(sub: argparse._SubParsersAction) -> None:
    p = sub.add_parser(
        "survey",
        help="generate an IEEE literature survey from a domain description",
    )
    p.add_argument(
        "domain", help="domain name, e.g. 'transformer time series forecasting'"
    )
    p.add_argument(
        "--keywords",
        default="",
        help="comma-separated extra keywords",
    )
    p.add_argument(
        "--year-from", type=int, default=None, help="earliest publication year"
    )
    p.add_argument("--year-to", type=int, default=None, help="latest publication year")
    p.add_argument(
        "--words",
        type=int,
        default=18000,
        help="target total word count (default: 18000)",
    )
    p.add_argument("--author", default="Anonymous", help="author byline")
    p.add_argument(
        "--ieee-variant",
        choices=("journal", "conference"),
        default="journal",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="where to write paper.tex / paper.pdf / paper.docx",
    )
    p.add_argument("--no-pdf", action="store_true", help="skip PDF export (tectonic)")
    p.add_argument("--no-docx", action="store_true", help="skip DOCX export (pandoc)")


def _build_seed(args: argparse.Namespace) -> StageMessage:
    keywords = tuple(k.strip() for k in args.keywords.split(",") if k.strip())
    time_window = None
    if args.year_from or args.year_to:
        time_window = (args.year_from or 1900, args.year_to or 2100)
    payload = {
        "domain_inputs": {
            "domain": args.domain,
            "keywords": keywords,
            "time_window": time_window,
            "language": "en",
            "length_words": args.words,
            "author": args.author,
            "ieee_variant": args.ieee_variant,
        }
    }
    return StageMessage(payload=payload)


async def _run(args: argparse.Namespace) -> int:
    config = load_config()
    if not config.endpoints:
        print(
            "no endpoint configured; run `folio init` or set FOLIO_LLM_ENDPOINTS",
            file=sys.stderr,
        )
        return 2
    registry = build_registry(config)
    survey_cfg = load_survey_config()
    msg = _build_seed(args)
    try:
        stream = run_survey(
            msg,
            registry=registry,
            config=survey_cfg,
            output_dir=args.output_dir,
            skip_export_pdf=args.no_pdf,
            skip_export_docx=args.no_docx,
        )
        async for upd, event in snapshotted(stream, kind="survey", topic=args.domain):
            if event.status == "finished":
                print(f"[{event.stage}] {event.detail}")
            msg = upd
    finally:
        for p in registry:
            with contextlib.suppress(Exception):
                await p.aclose()
    exports = msg.payload.get("exports", {})
    out_dir = exports.get("dir")
    if out_dir:
        print(f"\nwritten to: {out_dir}")
    return 0


def dispatch(args: argparse.Namespace) -> int:
    return asyncio.run(_run(args))


__all__ = ["add_subparser", "dispatch"]
