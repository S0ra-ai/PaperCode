# SPDX-License-Identifier: MPL-2.0
"""Jinja2 prompt loader.

Per AGENTS.md § 2, every prompt lives in `prompts/*.j2` — never inline.
The filename matches the stage name (e.g. `prompts/draft.j2`).
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined, select_autoescape

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"


@lru_cache(maxsize=1)
def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(PROMPTS_DIR)),
        autoescape=select_autoescape(default=False),
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
        keep_trailing_newline=True,
    )


def render(template_name: str, /, **context: Any) -> str:
    """Render `prompts/<template_name>` (e.g. ``draft.j2``)."""
    return _env().get_template(template_name).render(**context)
