# SPDX-License-Identifier: MPL-2.0
"""``folio init`` — interactive (and non-interactive) first-run wizard.

Creates ``$FOLIO_HOME/config.yml`` (default ``~/.folio/config.yml``)
with one endpoint, stores its API key via :mod:`app.config.secrets`,
and prints a quickstart hint. Idempotent: re-running with ``--force``
overwrites the named endpoint, otherwise leaves existing entries
untouched.

Non-interactive mode: pass ``--label/--base-url/--default-model`` and
either ``--api-key`` or set ``FOLIO_INIT_API_KEY`` in the environment.
Used by CI smoke tests and by ``folio init --headless``.
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import TextIO

from app.config.providers_store import (
    StoredEndpoint,
    list_all,
    upsert,
)


def _prompt(out: TextIO, in_: TextIO, message: str, default: str = "") -> str:
    if default:
        out.write(f"{message} [{default}]: ")
    else:
        out.write(f"{message}: ")
    out.flush()
    line = in_.readline()
    if not line:
        return default
    val = line.strip()
    return val or default


def add_subparser(sub: argparse._SubParsersAction[argparse.ArgumentParser]) -> None:
    init = sub.add_parser(
        "init",
        help="create ~/.folio/config.yml and register one endpoint",
    )
    init.add_argument("--label", default=None)
    init.add_argument("--base-url", default=None)
    init.add_argument("--default-model", default=None)
    init.add_argument("--api-key", default=None)
    init.add_argument(
        "--headless",
        action="store_true",
        help="non-interactive; require --label/--base-url/--default-model",
    )
    init.add_argument(
        "--force",
        action="store_true",
        help="overwrite the endpoint if it already exists",
    )


def dispatch(
    args: argparse.Namespace,
    *,
    stdout: TextIO | None = None,
    stdin: TextIO | None = None,
) -> int:
    out = stdout if stdout is not None else sys.stdout
    in_ = stdin if stdin is not None else sys.stdin

    headless = bool(args.headless)
    label = args.label
    base_url = args.base_url
    default_model = args.default_model
    api_key = args.api_key or os.environ.get("FOLIO_INIT_API_KEY")

    if headless:
        missing = [
            n
            for n, v in (
                ("--label", label),
                ("--base-url", base_url),
                ("--default-model", default_model),
            )
            if not v
        ]
        if missing:
            out.write("headless init requires: " + ", ".join(missing) + "\n")
            return 2
    else:
        out.write("Folio first-run setup\n")
        out.write("---------------------\n")
        label = _prompt(out, in_, "Endpoint label", label or "default")
        base_url = _prompt(out, in_, "Base URL (OpenAI-compatible /v1)", base_url or "")
        default_model = _prompt(out, in_, "Default model", default_model or "")
        if api_key is None:
            api_key = _prompt(out, in_, "API key (input not hidden)", "")

    if not (label and base_url and default_model):
        out.write("init aborted: label, base_url and default_model are required\n")
        return 2

    existing = {e.label for e in list_all()}
    if label in existing and not args.force:
        out.write(f"endpoint {label!r} already exists; pass --force to overwrite\n")
        return 1

    endpoint = StoredEndpoint(
        label=label,
        base_url=base_url,
        default_model=default_model,
    )
    upsert(endpoint, api_key=api_key or None)
    out.write(f"registered endpoint {label!r}.\n")
    out.write("Next steps:\n")
    out.write("  folio              # launch the TUI\n")
    out.write("  folio format list  # list cached paper formats\n")
    return 0
