"""Search source aggregator — async wrapper around UnifiedAcademicSearcher.

Provides async-compatible interface with result fusion and deduplication.
The heavy lifting is done by the existing search_service.UnifiedAcademicSearcher;
this module adds:
  - async/await interface via run_in_executor
  - DOI / title-based deduplication
  - Source confidence scoring
  - Structured result normalization
"""

from __future__ import annotations

import asyncio
import logging
from difflib import SequenceMatcher
from typing import Optional

from intelligen_engine.pipeline.retrieval.search_service import UnifiedAcademicSearcher

logger = logging.getLogger(__name__)


def _title_similarity(a: str, b: str) -> float:
    """Quick title similarity (0-1) via SequenceMatcher."""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


SOURCE_CONFIDENCE: dict[str, float] = {
    "Crossref API": 0.95,
    "OpenAlex": 0.90,
    "Semantic Scholar": 0.88,
    "ArXiv": 0.85,
    "Perplexity Sonar": 0.70,
    "Google Scholar": 0.65,
}


class SearchAggregator:
    """Unified search interface calling multiple academic sources concurrently.

    Wraps ``UnifiedAcademicSearcher`` (synchronous, ThreadPool-based) with an
    asyncio-compatible API and adds deduplication + confidence scoring.
    """

    def __init__(self, searcher: UnifiedAcademicSearcher | None = None):
        self._searcher = searcher or UnifiedAcademicSearcher()

    async def search(
        self,
        queries: list[str],
        limit: int = 6,
    ) -> list[dict]:
        """Run unified academic search and return deduplicated, scored results."""
        loop = asyncio.get_running_loop()

        raw_results: list[dict] = []
        for q in queries:
            results = await loop.run_in_executor(
                None,
                lambda query=q: self._searcher.search(query, limit=limit),
            )
            raw_results.extend(results)

        # Deduplicate
        deduped = self._deduplicate(raw_results)

        # Apply confidence scores
        scored = self._apply_confidence(deduped)

        # Sort by score descending
        scored.sort(key=lambda r: r.get("confidence", 0), reverse=True)

        return scored

    @staticmethod
    def _deduplicate(results: list[dict], title_threshold: float = 0.85) -> list[dict]:
        """Remove duplicate results by DOI or title similarity."""
        seen_dois: set[str] = set()
        seen_titles: list[str] = []
        unique: list[dict] = []

        for r in results:
            doi = (r.get("doi") or "").strip().lower()
            title = (r.get("title") or "").strip()

            # Skip if DOI already seen
            if doi and doi in seen_dois:
                continue

            # Skip if title is too similar to an existing one
            is_dup = False
            for st in seen_titles:
                if _title_similarity(title, st) >= title_threshold:
                    is_dup = True
                    break
            if is_dup:
                continue

            if doi:
                seen_dois.add(doi)
            if title:
                seen_titles.append(title)
            unique.append(r)

        return unique

    @staticmethod
    def _apply_confidence(results: list[dict]) -> list[dict]:
        """Attach a confidence score based on source reputation."""
        for r in results:
            source = r.get("source", "")
            base = SOURCE_CONFIDENCE.get(source, 0.5)

            # Boost for having DOI
            if r.get("doi"):
                base = min(1.0, base + 0.05)
            # Boost for having year
            if r.get("year"):
                base = min(1.0, base + 0.02)

            r["confidence"] = round(base, 3)

        return results
