# SPDX-License-Identifier: MPL-2.0
"""Semantic Scholar Graph API adapter."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.contract.survey_types import CorpusItem

log = logging.getLogger(__name__)

_BASE = "https://api.semanticscholar.org/graph/v1"
_FIELDS = ",".join(
    (
        "paperId",
        "externalIds",
        "title",
        "authors",
        "year",
        "venue",
        "abstract",
        "citationCount",
        "openAccessPdf",
        "url",
    )
)


class SemanticScholarClient:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        timeout: float = 15.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._timeout = timeout
        self._client = client

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            headers: dict[str, str] = {}
            if self._api_key:
                headers["x-api-key"] = self._api_key
            self._client = httpx.AsyncClient(
                base_url=_BASE, timeout=self._timeout, headers=headers
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def search(self, query: str, *, limit: int = 20) -> list[CorpusItem]:
        try:
            resp = await self._http().get(
                "/paper/search",
                params={"query": query, "limit": str(limit), "fields": _FIELDS},
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("semantic_scholar search failed: %s", exc)
            return []
        data = resp.json()
        return [_to_item(p) for p in data.get("data", []) if p]


def _to_item(p: dict[str, Any]) -> CorpusItem:
    ext = p.get("externalIds") or {}
    authors = tuple(
        (a.get("name") or "").strip()
        for a in (p.get("authors") or [])
        if a and a.get("name")
    )
    pdf = (p.get("openAccessPdf") or {}).get("url")
    return CorpusItem(
        key=f"s2:{p.get('paperId')}",
        doi=ext.get("DOI"),
        arxiv_id=ext.get("ArXiv"),
        title=(p.get("title") or "").strip(),
        authors=authors,
        year=p.get("year"),
        venue=p.get("venue"),
        abstract=(p.get("abstract") or "").strip(),
        url=p.get("url"),
        pdf_url=pdf,
        citation_count=int(p.get("citationCount") or 0),
        source_hits=("semantic_scholar",),
    )


__all__ = ["SemanticScholarClient"]
