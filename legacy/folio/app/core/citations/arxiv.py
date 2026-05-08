# SPDX-License-Identifier: MPL-2.0
"""arXiv API client (Atom feed).

Docs: https://info.arxiv.org/help/api/index.html
"""

from __future__ import annotations

from dataclasses import dataclass
from xml.etree import ElementTree as ET

import httpx

DEFAULT_BASE = "https://export.arxiv.org"
NS = {"atom": "http://www.w3.org/2005/Atom"}


@dataclass(frozen=True)
class ArxivEntry:
    arxiv_id: str
    title: str
    authors: tuple[str, ...]
    summary: str
    published: str  # ISO date
    pdf_url: str | None


class ArxivClient:
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
                timeout=self._timeout,
            )
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def search(self, query: str, *, max_results: int = 5) -> list[ArxivEntry]:
        resp = await self._http().get(
            "/api/query",
            params={
                "search_query": f"all:{query}",
                "start": "0",
                "max_results": str(max_results),
            },
        )
        resp.raise_for_status()
        return _parse_feed(resp.text)

    async def by_id(self, arxiv_id: str) -> ArxivEntry | None:
        resp = await self._http().get("/api/query", params={"id_list": arxiv_id})
        resp.raise_for_status()
        entries = _parse_feed(resp.text)
        return entries[0] if entries else None


def _parse_feed(xml_text: str) -> list[ArxivEntry]:
    root = ET.fromstring(xml_text)
    out: list[ArxivEntry] = []
    for entry in root.findall("atom:entry", NS):
        id_el = entry.find("atom:id", NS)
        if id_el is None or not id_el.text:
            continue
        arxiv_id = id_el.text.rsplit("/", 1)[-1]
        title_el = entry.find("atom:title", NS)
        title = (title_el.text or "").strip() if title_el is not None else ""
        summary_el = entry.find("atom:summary", NS)
        summary = (summary_el.text or "").strip() if summary_el is not None else ""
        published_el = entry.find("atom:published", NS)
        published = (published_el.text or "")[:10] if published_el is not None else ""
        authors = tuple(
            (a.findtext("atom:name", default="", namespaces=NS) or "").strip()
            for a in entry.findall("atom:author", NS)
        )
        pdf_url: str | None = None
        for link in entry.findall("atom:link", NS):
            if link.get("type") == "application/pdf":
                pdf_url = link.get("href")
                break
        out.append(
            ArxivEntry(
                arxiv_id=arxiv_id,
                title=title,
                authors=authors,
                summary=summary,
                published=published,
                pdf_url=pdf_url,
            )
        )
    return out
