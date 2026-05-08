# SPDX-License-Identifier: MPL-2.0
"""BibTeX entry assembly.

Just enough to emit valid `.bib` files for the export stage. We do NOT
try to be a full BibTeX parser.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

_KEY_BAD = re.compile(r"[^A-Za-z0-9_-]+")


def make_key(*, first_author: str, year: str | int, title: str) -> str:
    """Produce a sane BibTeX cite-key like ``smith2024transformer``."""
    last = first_author.split(",")[0].split()[-1] if first_author else "anon"
    last = unicodedata.normalize("NFKD", last).encode("ascii", "ignore").decode()
    word = re.split(r"\s+", title.strip(), maxsplit=1)[0] if title else ""
    word = unicodedata.normalize("NFKD", word).encode("ascii", "ignore").decode()
    raw = f"{last}{year}{word}".lower()
    return _KEY_BAD.sub("", raw) or "anon"


@dataclass(frozen=True)
class BibEntry:
    key: str
    entry_type: str  # article / inproceedings / misc / ...
    fields: dict[str, str] = field(default_factory=dict)
    source: str = "unknown"  # "crossref" | "arxiv" | "manual"

    def to_bibtex(self) -> str:
        lines = [f"@{self.entry_type}{{{self.key},"]
        for k, v in self.fields.items():
            if v is None:
                continue
            lines.append(f"  {k} = {{{_escape(str(v))}}},")
        lines.append("}")
        return "\n".join(lines)


def _escape(s: str) -> str:
    return s.replace("{", "\\{").replace("}", "\\}")


def from_crossref(item: dict[str, Any]) -> BibEntry:
    title = " ".join(item.get("title") or []) or "Untitled"
    authors = item.get("author") or []
    first = authors[0] if authors else {}
    first_name = (
        f"{first.get('family', '')}, {first.get('given', '')}".strip(", ")
        if first
        else "Anonymous"
    )
    year = ""
    issued = item.get("issued") or {}
    parts = issued.get("date-parts") or [[]]
    if parts and parts[0]:
        year = str(parts[0][0])
    doi = item.get("DOI", "")
    container = " ".join(item.get("container-title") or [])
    type_ = item.get("type", "article-journal")
    entry_type = "inproceedings" if "proceedings" in type_ else "article"
    key = make_key(first_author=first_name, year=year or "n.d.", title=title)
    fields: dict[str, str] = {
        "title": title,
        "author": " and ".join(
            f"{a.get('family', '')}, {a.get('given', '')}".strip(", ") for a in authors
        ),
        "year": year,
    }
    if container:
        fields["journal" if entry_type == "article" else "booktitle"] = container
    if doi:
        fields["doi"] = doi
    return BibEntry(key=key, entry_type=entry_type, fields=fields, source="crossref")


def from_arxiv(entry: object) -> BibEntry:
    """Build a BibEntry from `app.core.citations.arxiv.ArxivEntry`."""
    title = getattr(entry, "title", "Untitled")
    authors = getattr(entry, "authors", ())
    arxiv_id = getattr(entry, "arxiv_id", "")
    published = getattr(entry, "published", "")
    year = published[:4] if published else "n.d."
    first = authors[0] if authors else "Anonymous"
    key = make_key(first_author=first, year=year, title=title)
    fields = {
        "title": title,
        "author": " and ".join(authors),
        "year": year,
        "eprint": arxiv_id,
        "archivePrefix": "arXiv",
        "primaryClass": "cs",
    }
    return BibEntry(key=key, entry_type="misc", fields=fields, source="arxiv")


def format_bibtex(entries: list[BibEntry]) -> str:
    return "\n\n".join(e.to_bibtex() for e in entries) + "\n"
