# SPDX-License-Identifier: MPL-2.0
"""Folio CLI entry point.

Thin wrapper that delegates to :mod:`app.cli.main`. The real CLI
parser (top-level flags + subcommands) lives there so there is exactly
one source of truth for argparse routing and ``--help``.
"""

from __future__ import annotations

import sys


def main() -> None:
    from app.cli.main import run

    sys.exit(run())


if __name__ == "__main__":
    main()
