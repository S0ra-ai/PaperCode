"""LaTeX rendering for paper-mode drafts."""

from __future__ import annotations

from dataclasses import dataclass

from intelligen_engine.paper.models import FormatSpec, PaperDraft


@dataclass(frozen=True)
class LatexBundle:
    tex: str
    bib: str
    template_hint: str


def render_latex(draft: PaperDraft, spec: FormatSpec) -> LatexBundle:
    if spec.template_hint == "ieee.tex.j2":
        tex = _render_ieee(draft, spec)
    else:
        tex = _render_generic(draft, spec)
    return LatexBundle(tex=tex, bib=draft.bibliography, template_hint=spec.template_hint)


def _render_ieee(draft: PaperDraft, spec: FormatSpec) -> str:
    keywords = ", ".join(_escape_text(k) for k in draft.keywords)
    sections = "\n\n".join(_render_section(s.title, s.paragraphs) for s in draft.sections)
    bibliography = _render_bibliography(spec) if draft.bibliography.strip() else ""
    class_options = ",".join(
        [f"{spec.font_size_pt}pt", f"{spec.paper}paper", *spec.document_class_options]
    )
    return rf"""
\documentclass[{class_options}]{{IEEEtran}}

\usepackage[utf8]{{inputenc}}
\usepackage[T1]{{fontenc}}
\usepackage{{graphicx}}
\usepackage{{amsmath, amssymb}}
\usepackage{{cite}}
\usepackage{{hyperref}}

\title{{{_escape_text(draft.title)}}}
\author{{{_escape_text(", ".join(draft.authors))}}}

\begin{{document}}
\maketitle

\begin{{abstract}}
{_escape_text(draft.abstract)}
\end{{abstract}}

\begin{{IEEEkeywords}}
{keywords}
\end{{IEEEkeywords}}

{sections}

{bibliography}

\end{{document}}
""".lstrip()


def _render_generic(draft: PaperDraft, spec: FormatSpec) -> str:
    sections = "\n\n".join(_render_section(s.title, s.paragraphs) for s in draft.sections)
    bibliography = _render_bibliography(spec) if draft.bibliography.strip() else ""
    return rf"""
\documentclass[12pt]{{article}}
\usepackage[utf8]{{inputenc}}
\usepackage{{hyperref}}
\title{{{_escape_text(draft.title)}}}
\author{{{_escape_text(", ".join(draft.authors))}}}
\begin{{document}}
\maketitle
\tableofcontents
\begin{{abstract}}
{_escape_text(draft.abstract)}
\end{{abstract}}
{sections}
{bibliography}
\end{{document}}
""".lstrip()


def _render_section(title: str, paragraphs: list[str]) -> str:
    body = "\n\n".join(_escape_text(p) for p in paragraphs)
    return f"\\section{{{_escape_text(title)}}}\n{body}"


def _render_bibliography(spec: FormatSpec) -> str:
    return (
        f"\\bibliographystyle{{{spec.bibliography_style}}}\n"
        "\\bibliography{references}"
    )


def _escape_text(text: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
    }
    return "".join(replacements.get(ch, ch) for ch in text)
