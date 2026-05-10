"""Web crawler bridge for paper_fucker research runs.

The real crawler path is Scrapling-first when the dependency is available. The
fixture path is intentionally dependency-free so unit tests and offline research
runs can still produce auditable source records without live network access.
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any


try:  # pragma: no cover - optional dependency varies by workstation
    import scrapling  # type: ignore

    SCRAPLING_AVAILABLE = True
    SCRAPLING_VERSION = getattr(scrapling, "__version__", "unknown")
except Exception:  # pragma: no cover - optional dependency varies by workstation
    SCRAPLING_AVAILABLE = False
    SCRAPLING_VERSION = None


class _TitleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_title = False
        self._skip_depth = 0
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        del attrs
        lowered = tag.lower()
        if lowered == "title":
            self._in_title = True
        if lowered in {"script", "style", "noscript"}:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered == "title":
            self._in_title = False
        if lowered in {"script", "style", "noscript"} and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if not text:
            return
        if self._in_title:
            self.title_parts.append(text)
        elif self._skip_depth == 0:
            self.text_parts.append(text)

    def result(self) -> dict[str, str]:
        return {
            "title": " ".join(self.title_parts).strip(),
            "text": " ".join(self.text_parts).strip(),
        }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def parse_html(html: str) -> dict[str, str]:
    parser = _TitleTextParser()
    parser.feed(html)
    return parser.result()


def scrapling_status() -> dict[str, Any]:
    return {
        "available": SCRAPLING_AVAILABLE,
        "version": SCRAPLING_VERSION,
        "adapter": "scrapling",
    }


def crawl_html_fixture(
    *,
    url: str,
    html: str,
    robots_allowed: bool = True,
    license_status: str = "unknown",
    fetched_at: str | None = None,
) -> dict[str, Any]:
    parsed = parse_html(html)
    text = parsed["text"]
    return {
        "schema_version": "CrawlSourceRecord.v1",
        "source_id": f"crawl-source-{_sha256(url)[:12]}",
        "url": url,
        "fetched_at": fetched_at or _now_iso(),
        "status": "fetched" if robots_allowed else "blocked",
        "http_status": 200,
        "content_sha256": _sha256(html),
        "title": parsed["title"] or url,
        "text_excerpt": text[:500],
        "robots_allowed": robots_allowed,
        "license_status": license_status,
        "extraction_evidence": {
            "method": "manual_fixture",
            "selector": "html",
            "confidence": 0.85,
        },
        "diagnostics": [] if robots_allowed else ["robots_blocked"],
    }


def crawl_url(input_data: dict[str, Any]) -> dict[str, Any]:
    url = str(input_data["url"])
    html = input_data.get("html")
    robots_allowed = bool(input_data.get("robots_allowed", True))
    license_status = str(input_data.get("license_status", "unknown"))
    if isinstance(html, str):
        return crawl_html_fixture(
            url=url,
            html=html,
            robots_allowed=robots_allowed,
            license_status=license_status,
            fetched_at=input_data.get("fetched_at"),
        )

    if not SCRAPLING_AVAILABLE:
        return {
            "schema_version": "CrawlSourceRecord.v1",
            "source_id": f"crawl-source-{_sha256(url)[:12]}",
            "url": url,
            "fetched_at": _now_iso(),
            "status": "blocked",
            "robots_allowed": robots_allowed,
            "license_status": license_status,
            "extraction_evidence": {
                "method": "scrapling",
                "confidence": 0,
            },
            "diagnostics": ["scrapling_missing"],
        }

    # Keep the live Scrapling hook narrow: the caller must opt in to network.
    if not bool(input_data.get("allow_network", False)):
        return {
            "schema_version": "CrawlSourceRecord.v1",
            "source_id": f"crawl-source-{_sha256(url)[:12]}",
            "url": url,
            "fetched_at": _now_iso(),
            "status": "blocked",
            "robots_allowed": robots_allowed,
            "license_status": license_status,
            "extraction_evidence": {
                "method": "scrapling",
                "confidence": 0,
            },
            "diagnostics": ["network_not_authorized"],
        }

    return {
        "schema_version": "CrawlSourceRecord.v1",
        "source_id": f"crawl-source-{_sha256(url)[:12]}",
        "url": url,
        "fetched_at": _now_iso(),
        "status": "blocked",
        "robots_allowed": robots_allowed,
        "license_status": license_status,
        "extraction_evidence": {
            "method": "scrapling",
            "confidence": 0,
        },
        "diagnostics": ["scrapling_live_fetch_not_implemented"],
    }
