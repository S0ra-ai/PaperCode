# SPDX-License-Identifier: MPL-2.0
"""DOI / arXiv / title normalisation + fuzzy dedupe.

The survey pipeline federates 4-6 sources; the same paper often appears
multiple times. We key on:

1. normalised DOI (lowercase, strip scheme/host),
2. arXiv id (strip version suffix),
3. fallback: ``<title_slug>|<first_author_surname>|<year>``.

``dedupe_merge`` keeps the first copy and merges extra ``source_hits``,
higher ``citation_count``, and non-empty ``abstract`` from duplicates.
"""

from __future__ import annotations

import re
from collections.abc import Iterable

from app.core.contract.survey_types import CorpusItem

_DOI_RE = re.compile(r"10\.\d{4,9}/[^\s]+", re.IGNORECASE)
_ARXIV_RE = re.compile(
    r"(\d{4}\.\d{4,5})(v\d+)?|([a-z\-]+/\d{7})(v\d+)?", re.IGNORECASE
)
_TITLE_WS = re.compile(r"\s+")
_TITLE_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def normalise_doi(doi: str | None) -> str | None:
    if not doi:
        return None
    m = _DOI_RE.search(doi.strip())
    if not m:
        return None
    return m.group(0).lower()


def normalise_arxiv(arxiv_id: str | None) -> str | None:
    if not arxiv_id:
        return None
    m = _ARXIV_RE.search(arxiv_id.strip())
    if not m:
        return None
    base = m.group(1) or m.group(3) or ""
    return base.lower()


def _slug_title(title: str) -> str:
    t = _TITLE_PUNCT.sub(" ", title.lower())
    return _TITLE_WS.sub(" ", t).strip()


def make_dedupe_key(item: CorpusItem) -> str:
    doi = normalise_doi(item.doi)
    if doi:
        return f"doi:{doi}"
    arx = normalise_arxiv(item.arxiv_id)
    if arx:
        return f"arxiv:{arx}"
    slug = _slug_title(item.title)
    first_author = ""
    if item.authors:
        first_author = item.authors[0].split()[-1].lower() if item.authors[0] else ""
    year = str(item.year) if item.year else "?"
    return f"title:{slug}|{first_author}|{year}"


def dedupe_merge(items: Iterable[CorpusItem]) -> list[CorpusItem]:
    """De-duplicate, merging evidence (source_hits, citations, abstract)."""

    bucket: dict[str, CorpusItem] = {}
    for item in items:
        key = make_dedupe_key(item)
        existing = bucket.get(key)
        if existing is None:
            bucket[key] = item.model_copy(
                update={
                    "key": key,
                    "doi": normalise_doi(item.doi),
                    "arxiv_id": normalise_arxiv(item.arxiv_id),
                }
            )
            continue
        merged = existing.model_copy(
            update={
                "source_hits": tuple(
                    dict.fromkeys((*existing.source_hits, *item.source_hits))
                ),
                "citation_count": max(existing.citation_count, item.citation_count),
                "abstract": existing.abstract or item.abstract,
                "doi": existing.doi or normalise_doi(item.doi),
                "arxiv_id": existing.arxiv_id or normalise_arxiv(item.arxiv_id),
                "pdf_url": existing.pdf_url or item.pdf_url,
                "venue": existing.venue or item.venue,
                "year": existing.year or item.year,
            }
        )
        bucket[key] = merged
    return list(bucket.values())


__all__ = [
    "dedupe_merge",
    "make_dedupe_key",
    "normalise_arxiv",
    "normalise_doi",
]
