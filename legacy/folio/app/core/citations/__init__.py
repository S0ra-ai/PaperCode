# SPDX-License-Identifier: MPL-2.0
"""Citation backends: Crossref, arXiv, BibTeX assembly."""

from app.core.citations.arxiv import ArxivClient
from app.core.citations.bibtex import BibEntry, format_bibtex
from app.core.citations.crossref import CrossrefClient

__all__ = [
    "ArxivClient",
    "BibEntry",
    "CrossrefClient",
    "format_bibtex",
]
