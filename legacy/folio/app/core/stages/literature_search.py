# SPDX-License-Identifier: MPL-2.0
"""LiteratureSearchStage — federated multi-source search.

Runs enabled adapters concurrently with per-source timeouts. Aggregates
results into ``payload['lit_search_raw']`` (flat list of CorpusItem
dicts). At least ``min_sources_required`` adapters must return a
non-empty list; otherwise the stage raises ``LiteratureSearchError``
and the orchestrator falls back to asking the user to broaden the
query.

Adapters can be injected (``adapters=...``) for testing; the default
wiring honours the ``SurveyConfig.sources`` toggles.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Protocol

from app.config.survey import SurveyConfig
from app.core.citations import ArxivClient, CrossrefClient
from app.core.citations.bibtex import from_crossref
from app.core.contract import StageMessage, StageRecord
from app.core.contract.survey_types import CorpusItem, DomainSpec
from app.tools.literature import (
    IEEEXploreClient,
    OpenAlexClient,
    ScholarWebClient,
    SemanticScholarClient,
)

log = logging.getLogger(__name__)

STAGE = "lit_search"


class LiteratureSearchError(RuntimeError):
    """Not enough sources returned results to proceed."""


class _Searchable(Protocol):
    async def search(
        self, query: str, *, limit: int
    ) -> list[CorpusItem]: ...  # pragma: no cover
    async def aclose(self) -> None: ...  # pragma: no cover


def _build_query(domain: DomainSpec) -> str:
    parts = [domain.domain, *domain.keywords]
    return " ".join(p for p in parts if p).strip()


async def _arxiv_wrap(client: ArxivClient, query: str, limit: int) -> list[CorpusItem]:
    try:
        entries = await client.search(query, max_results=limit)
    except Exception as exc:
        log.warning("arxiv search failed: %s", exc)
        return []
    out: list[CorpusItem] = []
    for e in entries:
        out.append(
            CorpusItem(
                key=f"arxiv:{e.arxiv_id}",
                arxiv_id=e.arxiv_id,
                title=e.title,
                authors=tuple(e.authors),
                year=int(e.published[:4]) if e.published else None,
                abstract=e.summary,
                pdf_url=e.pdf_url,
                url=f"https://arxiv.org/abs/{e.arxiv_id}",
                source_hits=("arxiv",),
            )
        )
    return out


async def _crossref_wrap(
    client: CrossrefClient, query: str, limit: int
) -> list[CorpusItem]:
    try:
        items = await client.search(query, rows=limit)
    except Exception as exc:
        log.warning("crossref search failed: %s", exc)
        return []
    out: list[CorpusItem] = []
    for item in items:
        bib = from_crossref(item)
        authors_raw = item.get("author") or []
        authors = tuple(
            f"{a.get('given', '')} {a.get('family', '')}".strip()
            for a in authors_raw
            if a
        )
        year = None
        issued = (item.get("issued") or {}).get("date-parts") or [[]]
        if issued and issued[0]:
            try:
                year = int(issued[0][0])
            except (TypeError, ValueError):
                year = None
        out.append(
            CorpusItem(
                key=f"crossref:{bib.key}",
                doi=item.get("DOI"),
                title=bib.fields.get("title", ""),
                authors=authors,
                year=year,
                venue=bib.fields.get("journal") or bib.fields.get("booktitle"),
                abstract=(item.get("abstract") or "").strip(),
                url=item.get("URL"),
                citation_count=int(item.get("is-referenced-by-count") or 0),
                source_hits=("crossref",),
            )
        )
    return out


_Adapter = Callable[[], Awaitable[list[CorpusItem]]]


async def run(
    msg: StageMessage,
    *,
    config: SurveyConfig | None = None,
    arxiv: ArxivClient | None = None,
    crossref: CrossrefClient | None = None,
    semantic_scholar: _Searchable | None = None,
    openalex: _Searchable | None = None,
    ieee_xplore: _Searchable | None = None,
    scholar_web: _Searchable | None = None,
) -> StageMessage:
    started = datetime.now(UTC)
    cfg = config or SurveyConfig()
    domain = DomainSpec.model_validate(msg.payload["domain"])
    query = _build_query(domain)
    limit = cfg.per_source_limit

    owned: list[_Searchable] = []

    def _make_arxiv() -> ArxivClient:
        nonlocal arxiv
        if arxiv is None:
            arxiv = ArxivClient()
            owned.append(arxiv)  # type: ignore[arg-type]
        return arxiv

    def _make_crossref() -> CrossrefClient:
        nonlocal crossref
        if crossref is None:
            crossref = CrossrefClient()
            owned.append(crossref)  # type: ignore[arg-type]
        return crossref

    def _make_s2() -> _Searchable:
        nonlocal semantic_scholar
        if semantic_scholar is None:
            semantic_scholar = SemanticScholarClient(
                api_key=cfg.semantic_scholar_api_key
            )
            owned.append(semantic_scholar)
        return semantic_scholar

    def _make_oa() -> _Searchable:
        nonlocal openalex
        if openalex is None:
            openalex = OpenAlexClient()
            owned.append(openalex)
        return openalex

    def _make_ieee() -> _Searchable:
        nonlocal ieee_xplore
        if ieee_xplore is None:
            ieee_xplore = IEEEXploreClient(api_key=cfg.ieee_xplore_api_key)
            owned.append(ieee_xplore)
        return ieee_xplore

    def _make_scholar() -> _Searchable:
        nonlocal scholar_web
        if scholar_web is None:
            scholar_web = ScholarWebClient(enabled=cfg.sources.scholar_web)
            owned.append(scholar_web)
        return scholar_web

    tasks: dict[str, _Adapter] = {}
    if cfg.sources.arxiv:
        tasks["arxiv"] = lambda: _arxiv_wrap(_make_arxiv(), query, limit)
    if cfg.sources.crossref:
        tasks["crossref"] = lambda: _crossref_wrap(_make_crossref(), query, limit)
    if cfg.sources.semantic_scholar:
        tasks["semantic_scholar"] = lambda: _make_s2().search(query, limit=limit)
    if cfg.sources.openalex:
        tasks["openalex"] = lambda: _make_oa().search(query, limit=limit)
    if cfg.sources.ieee_xplore:
        tasks["ieee_xplore"] = lambda: _make_ieee().search(query, limit=limit)
    if cfg.sources.scholar_web:
        tasks["scholar_web"] = lambda: _make_scholar().search(query, limit=limit)

    async def _guarded(name: str, coro: _Adapter) -> tuple[str, list[CorpusItem]]:
        try:
            result = await asyncio.wait_for(coro(), timeout=cfg.per_source_timeout_s)
            return name, result
        except TimeoutError:
            log.warning(
                "source %s timed out after %.1fs", name, cfg.per_source_timeout_s
            )
            return name, []
        except Exception as exc:
            log.warning("source %s errored: %s", name, exc)
            return name, []

    try:
        per_source = await asyncio.gather(
            *(_guarded(name, coro) for name, coro in tasks.items())
        )
    finally:
        for obj in owned:
            with contextlib.suppress(Exception):
                await obj.aclose()

    aggregated: list[CorpusItem] = []
    successful_sources: list[str] = []
    per_source_counts: dict[str, int] = {}
    for name, items in per_source:
        per_source_counts[name] = len(items)
        if items:
            successful_sources.append(name)
            aggregated.extend(items)

    if len(successful_sources) < cfg.min_sources_required:
        raise LiteratureSearchError(
            f"LiteratureSearchStage: only {len(successful_sources)} source(s) "
            f"returned results (need ≥{cfg.min_sources_required}); counts="
            f"{per_source_counts}"
        )

    new = msg.model_copy(deep=True)
    new.payload["lit_search_raw"] = [i.model_dump() for i in aggregated]
    new.payload["lit_search_sources"] = per_source_counts

    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=(
            f"query={query!r} sources={len(successful_sources)} hits={len(aggregated)}"
        ),
    )
    return new.with_record(record)
