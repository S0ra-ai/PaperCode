# SPDX-License-Identifier: MPL-2.0
"""IEEE Xplore adapter (optional; no-op without an API key)."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.contract.survey_types import CorpusItem

log = logging.getLogger(__name__)

_BASE = "https://ieeexploreapi.ieee.org/api/v1"


class IEEEXploreClient:
    def __init__(
        self,
        *,
        api_key: str | None,
        timeout: float = 15.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
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
        if not self._api_key:
            log.info("ieee_xplore search skipped: no api key configured")
            return []
        try:
            resp = await self._http().get(
                "/search/articles",
                params={
                    "querytext": query,
                    "max_records": str(limit),
                    "apikey": self._api_key,
                    "format": "json",
                },
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            log.warning("ieee_xplore search failed: %s", exc)
            return []
        data = resp.json()
        return [_to_item(a) for a in (data.get("articles") or [])]


def _to_item(a: dict[str, Any]) -> CorpusItem:
    authors = tuple(
        (au.get("full_name") or "").strip()
        for au in ((a.get("authors") or {}).get("authors") or [])
    )
    return CorpusItem(
        key=f"ieee:{a.get('article_number')}",
        doi=a.get("doi"),
        arxiv_id=None,
        title=(a.get("title") or "").strip(),
        authors=authors,
        year=int(a.get("publication_year") or 0) or None,
        venue=a.get("publication_title"),
        abstract=(a.get("abstract") or "").strip(),
        url=a.get("html_url"),
        pdf_url=a.get("pdf_url"),
        citation_count=int(a.get("citing_paper_count") or 0),
        source_hits=("ieee_xplore",),
    )


__all__ = ["IEEEXploreClient"]
