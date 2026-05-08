# SPDX-License-Identifier: MPL-2.0
"""ExportLatex stage — render `draft` + FormatSpec into `.tex` + `.bib`.

Writes to ``payload['exports']['tex']`` (path) and
``payload['exports']['bib']`` (path). Output dir defaults to
``~/.folio/runs/<run_id>/`` but is fully overridable for tests.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.config.loader import folio_home
from app.core.contract import StageMessage, StageRecord
from app.core.formats import FormatSpec

STAGE = "export_latex"

TEMPLATES_DIR = Path(__file__).resolve().parents[3] / "templates" / "latex"

_LATEX_ESCAPES = {
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "{": r"\{",
    "}": r"\}",
    "~": r"\textasciitilde{}",
    "^": r"\textasciicircum{}",
    "\\": r"\textbackslash{}",
}


def latex_escape(value: object) -> str:
    s = str(value)
    return "".join(_LATEX_ESCAPES.get(c, c) for c in s)


def _env() -> Environment:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(default=False),
        keep_trailing_newline=True,
    )
    env.filters["latex_escape"] = latex_escape
    return env


def _output_dir(msg: StageMessage, override: Path | None) -> Path:
    if override is not None:
        override.mkdir(parents=True, exist_ok=True)
        return override
    d = folio_home() / "runs" / msg.run_id
    d.mkdir(parents=True, exist_ok=True)
    return d


async def run(
    msg: StageMessage,
    *,
    output_dir: Path | None = None,
) -> StageMessage:
    started = datetime.now(UTC)
    spec = FormatSpec.model_validate(msg.payload["format_spec"])
    draft = msg.payload["draft"]
    bib = msg.payload.get("bibliography", "")
    clarify = msg.payload.get("clarify", {})
    author = clarify.get("author", "Anonymous")

    template_name = spec.template_hint or "_generic.tex.j2"
    if not (TEMPLATES_DIR / template_name).exists():
        template_name = "_generic.tex.j2"

    biblatex_style = "numeric"
    if spec.citation_style.value == "author_year":
        biblatex_style = "authoryear"
    elif spec.citation_style.value == "gbt_7714":
        biblatex_style = "gb7714-2015"
    elif spec.citation_style.value == "superscript":
        biblatex_style = "numeric-comp"

    template = _env().get_template(template_name)
    has_bibliography = bool((bib or "").strip())
    rendered = template.render(
        draft=draft,
        format_spec=spec,
        margins=spec.margins,
        font=spec.font,
        font_size_pt=int(spec.font.body_size_pt),
        paper="a4" if spec.page_size.value == "A4" else "letter",
        columns=spec.columns,
        biblatex_style=biblatex_style,
        keywords=draft.get("keywords", []),
        author=author,
        has_bibliography=has_bibliography,
    )

    out = _output_dir(msg, output_dir)
    tex_path = out / "paper.tex"
    bib_path = out / "references.bib"
    tex_path.write_text(rendered, encoding="utf-8")
    bib_path.write_text(bib or "", encoding="utf-8")

    new = msg.model_copy(deep=True)
    new.payload.setdefault("exports", {})
    new.payload["exports"]["tex"] = str(tex_path)
    new.payload["exports"]["bib"] = str(bib_path)
    new.payload["exports"]["dir"] = str(out)

    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=f"wrote {tex_path.name} ({len(rendered)} chars)",
    )
    return new.with_record(record)
