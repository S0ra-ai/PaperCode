# SPDX-License-Identifier: MPL-2.0
"""OpenAlex works adapter."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from app.core.contract.survey_types import CorpusItem

log = logging.getLogger(__name__)

_BASE = "https://api.openalex.org"


class OpenAlexClient:
    def __init__(
        self,
        *,
        mailto: str | None = None,
        timeout: float = 15.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._mailto = mailto or os.environ.get("FOLIO_OPENALEX_MAILTO") or None
        self._timeout = timeout
        self._client = client

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=_BASE, timeout=self._timeout)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def search(self, query: str, *, limit: int = 25) -> list[CorpusItem]:
        params = {"search": query, "per_page": str(limit)}
        if self._mailto:
            params["mailto"] = self._mailto
        try:
            resp = await self._http().get("/works", params=params)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("openalex search failed: %s", exc)
            return []
        data = resp.json()
        return [_to_item(w) for w in (data.get("results") or [])]


def _to_item(w: dict[str, Any]) -> CorpusItem:
    ids = w.get("ids") or {}
    doi = (ids.get("doi") or "").replace("https://doi.org/", "") or None
    authors = tuple(
        ((a.get("author") or {}).get("display_name") or "").strip()
        for a in (w.get("authorships") or [])
        if a
    )
    pdf_url = (w.get("best_oa_location") or {}).get("pdf_url")
    return CorpusItem(
        key=f"oa:{w.get('id')}",
        doi=doi,
        arxiv_id=None,
        title=(w.get("title") or "").strip(),
        authors=authors,
        year=w.get("publication_year"),
        venue=((w.get("primary_location") or {}).get("source") or {}).get(
            "display_name"
        ),
        abstract=_reconstruct_abstract(w.get("abstract_inverted_index")),
        url=(w.get("primary_location") or {}).get("landing_page_url"),
        pdf_url=pdf_url,
        citation_count=int(w.get("cited_by_count") or 0),
        source_hits=("openalex",),
    )


def _reconstruct_abstract(inv: dict[str, list[int]] | None) -> str:
    if not inv:
        return ""
    positions: list[tuple[int, str]] = []
    for word, poss in inv.items():
        for p in poss:
            positions.append((p, word))
    positions.sort()
    return " ".join(w for _, w in positions)


__all__ = ["OpenAlexClient"]
