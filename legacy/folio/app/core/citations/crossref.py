# SPDX-License-Identifier: MPL-2.0
"""Crossref REST client (read-only).

Docs: https://api.crossref.org/swagger-ui/index.html
"""

from __future__ import annotations

from typing import Any

import httpx

DEFAULT_BASE = "https://api.crossref.org"
USER_AGENT = "Folio/0.1 (+https://github.com/folio)"


class CrossrefClient:
    def __init__(
        self,
        *,
        base_url: str = DEFAULT_BASE,
        timeout: float = 30.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self._client = client

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=self._base,
                headers={"User-Agent": USER_AGENT},
                timeout=self._timeout,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def search(self, query: str, *, rows: int = 5) -> list[dict[str, Any]]:
        resp = await self._http().get(
            "/works", params={"query": query, "rows": str(rows)}
        )
        resp.raise_for_status()
        items = resp.json().get("message", {}).get("items", [])
        return list(items)

    async def by_doi(self, doi: str) -> dict[str, Any] | None:
        resp = await self._http().get(f"/works/{doi}")
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        return dict(resp.json().get("message", {}))
