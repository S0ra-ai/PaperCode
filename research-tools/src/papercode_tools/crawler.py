"""Web crawler bridge for papercode research runs.

The real crawler path is Scrapling-first when the dependency is available. Tests
may also pass explicit HTML content; product calls without authorized network
access return blocked diagnostics instead of synthesizing web records.
"""

from __future__ import annotations

import hashlib
import urllib.parse
import urllib.request
import urllib.robotparser
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


def _source_id(url: str) -> str:
    return f"crawl-source-{_sha256(url)[:12]}"


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


def crawl_html_provided(
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
        "source_id": _source_id(url),
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
            "method": "provided_html",
            "selector": "html",
            "confidence": 0.85,
        },
        "diagnostics": [] if robots_allowed else ["robots_blocked"],
    }


def _blocked_record(
    *,
    url: str,
    robots_allowed: bool,
    license_status: str,
    diagnostics: list[str],
    method: str = "scrapling",
) -> dict[str, Any]:
    return {
        "schema_version": "CrawlSourceRecord.v1",
        "source_id": _source_id(url),
        "url": url,
        "fetched_at": _now_iso(),
        "status": "blocked",
        "robots_allowed": robots_allowed,
        "license_status": license_status,
        "extraction_evidence": {
            "method": method,
            "confidence": 0,
        },
        "diagnostics": diagnostics,
    }


def _robots_url(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"Unsupported crawl URL: {url}")
    return urllib.parse.urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))


def _check_robots(url: str, *, user_agent: str, strict: bool) -> tuple[bool, list[str]]:
    parser = urllib.robotparser.RobotFileParser(_robots_url(url))
    try:
        parser.read()
    except Exception as error:
        if strict:
            return False, [f"robots_check_failed:{type(error).__name__}"]
        return True, [f"robots_check_unavailable:{type(error).__name__}"]
    return parser.can_fetch(user_agent, url), []


def _page_to_html(page: Any) -> str:
    for attr in ("html", "text", "body", "content"):
        value = getattr(page, attr, None)
        if isinstance(value, str):
            return value
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
    if hasattr(page, "get_all_text"):
        try:
            return str(page.get_all_text())
        except Exception:
            pass
    return str(page)


def _page_status(page: Any) -> int | None:
    for attr in ("status", "status_code", "http_status"):
        value = getattr(page, attr, None)
        if isinstance(value, int):
            return value
    return None


def _fetch_with_scrapling(url: str, *, user_agent: str, timeout: int) -> tuple[str, int | None, str]:
    try:
        from scrapling.fetchers import Fetcher  # type: ignore
    except Exception:
        try:
            from scrapling.defaults import Fetcher  # type: ignore
        except Exception as error:
            raise RuntimeError(f"scrapling_import_failed:{type(error).__name__}") from error

    fetcher = Fetcher()
    get = getattr(fetcher, "get", None)
    if get is None:
        get = getattr(Fetcher, "get", None)
    if get is None:
        raise RuntimeError("scrapling_fetcher_get_missing")

    kwargs = {
        "timeout": timeout,
        "follow_redirects": True,
        "headers": {"User-Agent": user_agent},
    }
    try:
        page = get(url, **kwargs)
    except TypeError:
        page = get(url)
    html = _page_to_html(page)
    return html, _page_status(page), "scrapling"


def _fetch_with_urllib(url: str, *, user_agent: str, timeout: int, max_bytes: int) -> tuple[str, int | None, str]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec B310 - explicit user-authorized crawl URL
        raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise RuntimeError("crawl_response_too_large")
        charset = response.headers.get_content_charset() or "utf-8"
        return raw.decode(charset, errors="replace"), getattr(response, "status", None), "urllib"


def _fetch_live_html(input_data: dict[str, Any]) -> tuple[str, int | None, str, list[str]]:
    url = str(input_data["url"])
    user_agent = str(input_data.get("user_agent", "papercode/0.8 research-crawler"))
    timeout = int(input_data.get("timeout_seconds", 20))
    max_bytes = int(input_data.get("max_bytes", 2_000_000))
    diagnostics: list[str] = []

    if SCRAPLING_AVAILABLE:
        try:
            html, status, method = _fetch_with_scrapling(url, user_agent=user_agent, timeout=timeout)
            return html, status, method, diagnostics
        except Exception as error:
            diagnostics.append(f"scrapling_fetch_failed:{type(error).__name__}")
    else:
        diagnostics.append("scrapling_missing")

    html, status, method = _fetch_with_urllib(url, user_agent=user_agent, timeout=timeout, max_bytes=max_bytes)
    return html, status, method, diagnostics


def crawl_url(input_data: dict[str, Any]) -> dict[str, Any]:
    url = str(input_data["url"])
    html = input_data.get("html")
    license_status = str(input_data.get("license_status", "unknown"))
    if isinstance(html, str):
        robots_allowed = bool(input_data.get("robots_allowed", True))
        return crawl_html_provided(
            url=url,
            html=html,
            robots_allowed=robots_allowed,
            license_status=license_status,
            fetched_at=input_data.get("fetched_at"),
        )

    if not bool(input_data.get("allow_network", False)):
        return _blocked_record(
            url=url,
            robots_allowed=bool(input_data.get("robots_allowed", True)),
            license_status=license_status,
            diagnostics=["network_not_authorized"],
        )

    user_agent = str(input_data.get("user_agent", "papercode/0.8 research-crawler"))
    if "robots_allowed" in input_data:
        robots_allowed = bool(input_data.get("robots_allowed"))
        robot_diagnostics: list[str] = []
    elif bool(input_data.get("respect_robots", True)):
        robots_allowed, robot_diagnostics = _check_robots(
            url,
            user_agent=user_agent,
            strict=bool(input_data.get("strict_robots", False)),
        )
    else:
        robots_allowed, robot_diagnostics = True, ["robots_check_skipped_by_policy"]

    if not robots_allowed:
        return _blocked_record(
            url=url,
            robots_allowed=False,
            license_status=license_status,
            diagnostics=[*robot_diagnostics, "robots_blocked"],
        )

    try:
        live_html, http_status, method, fetch_diagnostics = _fetch_live_html(input_data)
    except Exception as error:
        return _blocked_record(
            url=url,
            robots_allowed=robots_allowed,
            license_status=license_status,
            diagnostics=[*robot_diagnostics, f"fetch_failed:{type(error).__name__}"],
        )

    parsed = parse_html(live_html)
    text = parsed["text"]
    return {
        "schema_version": "CrawlSourceRecord.v1",
        "source_id": _source_id(url),
        "url": url,
        "fetched_at": _now_iso(),
        "status": "fetched",
        "http_status": http_status or 200,
        "content_sha256": _sha256(live_html),
        "title": parsed["title"] or url,
        "text_excerpt": text[:500],
        "robots_allowed": robots_allowed,
        "license_status": license_status,
        "extraction_evidence": {
            "method": method,
            "selector": "html",
            "confidence": 0.82 if method == "urllib" else 0.9,
        },
        "diagnostics": [*robot_diagnostics, *fetch_diagnostics],
    }
