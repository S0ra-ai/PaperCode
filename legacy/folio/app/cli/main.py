# SPDX-License-Identifier: MPL-2.0
"""Folio CLI dispatcher.

Top-level entry: `folio` runs the TUI (default) or a subcommand.
Subcommands available in M1:

  folio init [--headless ...]
  folio format list [TIER]
  folio format show <KEY>
  folio format refresh <KEY>
  folio format forget <KEY>
  folio format import <PATH> [--key KEY]

Top-level flags (when no subcommand is given) launch the TUI:

  folio                 launch the progress TUI
  folio --pdf PATH      launch the TUI with a sample PDF preloaded
  folio --hello         launch the M0 hello TUI
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.cli import format_cmd, init_cmd, resume_cmd, survey_cmd


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="folio",
        description=(
            "Folio — TUI-native, vendor-agnostic academic paper "
            "generator. Run with no arguments to launch the TUI."
        ),
        epilog=(
            "Quickstart: `folio init` to register an endpoint, then "
            "`folio` to start the TUI. See docs/quickstart.md."
        ),
    )
    p.add_argument(
        "--pdf",
        type=Path,
        default=None,
        help="sample PDF to preload when launching the TUI",
    )
    p.add_argument(
        "--survey",
        default=None,
        help="launch the TUI in M6 survey mode for the given domain",
    )
    p.add_argument(
        "--survey-keywords",
        default="",
        help="comma-separated keywords for --survey",
    )
    p.add_argument(
        "--survey-words",
        type=int,
        default=18000,
        help="target word count for --survey (default: 18000)",
    )
    p.add_argument(
        "--survey-author",
        default="Anonymous",
        help="author byline for --survey",
    )
    p.add_argument(
        "--survey-output-dir",
        type=Path,
        default=None,
        help="output directory for --survey",
    )
    p.add_argument(
        "--hello",
        action="store_true",
        help="launch the M0 hello TUI instead of the progress TUI",
    )

    sub = p.add_subparsers(dest="command")

    init_cmd.add_subparser(sub)
    survey_cmd.add_subparser(sub)
    resume_cmd.add_subparser(sub)

    fmt = sub.add_parser("format", help="manage cached FormatSpec entries")
    fmt_sub = fmt.add_subparsers(dest="action", required=True)

    list_p = fmt_sub.add_parser("list", help="list cached format specs")
    list_p.add_argument(
        "tier",
        nargs="?",
        choices=("custom", "venue", "builtin", "all"),
        default="all",
    )

    show_p = fmt_sub.add_parser("show", help="print a single format spec as JSON")
    show_p.add_argument("key")
    show_p.add_argument(
        "--tier",
        choices=("custom", "venue", "builtin"),
        default=None,
    )

    refresh_p = fmt_sub.add_parser(
        "refresh", help="force re-extract a venue/custom spec"
    )
    refresh_p.add_argument("key")
    refresh_p.add_argument(
        "--tier",
        choices=("custom", "venue"),
        default="venue",
    )

    forget_p = fmt_sub.add_parser(
        "forget", help="remove a cached spec (and its history)"
    )
    forget_p.add_argument("key")
    forget_p.add_argument(
        "--tier",
        choices=("custom", "venue"),
        required=True,
    )

    import_p = fmt_sub.add_parser(
        "import", help="import a hand-authored spec JSON into custom"
    )
    import_p.add_argument("path")
    import_p.add_argument("--key", default=None)

    return p


def run(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "format":
        return format_cmd.dispatch(args)
    if args.command == "init":
        return init_cmd.dispatch(args)
    if args.command == "survey":
        return survey_cmd.dispatch(args)
    if args.command == "resume":
        return resume_cmd.dispatch(args)

    if args.hello:
        from app.tui.hello import HelloFolioApp

        HelloFolioApp().run()
        return 0

    from app.tui.progress import main as tui_main

    survey_keywords = tuple(
        k.strip() for k in (args.survey_keywords or "").split(",") if k.strip()
    )
    tui_main(
        pdf_path=args.pdf,
        survey_domain=args.survey,
        survey_keywords=survey_keywords,
        survey_words=args.survey_words,
        survey_author=args.survey_author,
        survey_output_dir=args.survey_output_dir,
    )
    return 0


if __name__ == "__main__":
    sys.exit(run())
