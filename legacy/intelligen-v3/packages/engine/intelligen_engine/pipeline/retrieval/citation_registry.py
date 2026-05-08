"""Citation Registry — single source of truth for all references in a report."""

import re
import threading
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class CitationEntry:
    """A single registered citation."""

    number: int
    title: str
    authors: str
    year: str
    url: str
    source: str
    snippet: str = ""
    # Chunk-level metadata (P11-6)
    chunk_id: str = ""
    doc_id: str = ""
    page: int | None = None
    offset: int | None = None
    chunk_index: int | None = None
    source_paragraph: str = ""


class CitationRegistry:
    """Tracks [N] → citation metadata. All search results must register before
    being cited.

    Thread-safe: uses RLock so ``register_batch`` can safely call ``register``.
    """

    def __init__(self):
        self._lock = threading.RLock()
        self._entries: Dict[int, CitationEntry] = {}
        self._title_index: Dict[str, int] = {}  # normalized_title → number
        self._url_index: Dict[str, int] = {}     # normalized_url → number
        self._next_number: int = 1

    # ------------------------------------------------------------------
    # Normalization helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _normalize_title(title: str) -> str:
        """Lowercase, replace punctuation with spaces, collapse whitespace."""
        t = title.lower().strip()
        t = re.sub(r'[^\w\s]', ' ', t)   # punctuation → space (preserves word boundaries)
        return re.sub(r'\s+', ' ', t).strip()

    @staticmethod
    def _normalize_url(url: str) -> str:
        """Strip protocol and trailing slash for dedup."""
        url = url.strip().lower()
        url = re.sub(r'^https?://', '', url)
        return url.rstrip('/')

    # ------------------------------------------------------------------
    # Core API
    # ------------------------------------------------------------------
    def register(self, title: str, authors: str, year: str, url: str,
                 source: str, snippet: str = "",
                 chunk_id: str = "", doc_id: str = "",
                 page: int | None = None, offset: int | None = None,
                 chunk_index: int | None = None,
                 source_paragraph: str = "") -> int:
        """Register a citation, return its [N] number. Deduplicates by
        normalized title or URL."""
        with self._lock:
            norm_title = self._normalize_title(title)
            norm_url = self._normalize_url(url) if url else ""

            # Deduplicate — prefer URL match, fall back to title
            if norm_url and norm_url in self._url_index:
                return self._url_index[norm_url]
            if norm_title and norm_title in self._title_index:
                return self._title_index[norm_title]

            number = self._next_number
            self._next_number += 1

            entry = CitationEntry(
                number=number,
                title=title.strip(),
                authors=authors.strip(),
                year=str(year).strip(),
                url=url.strip(),
                source=source.strip(),
                snippet=snippet.strip(),
                chunk_id=chunk_id,
                doc_id=doc_id,
                page=page,
                offset=offset,
                chunk_index=chunk_index,
                source_paragraph=source_paragraph,
            )
            self._entries[number] = entry

            if norm_title:
                self._title_index[norm_title] = number
            if norm_url:
                self._url_index[norm_url] = number

            return number

    def register_batch(self, results: List[Dict]) -> List[int]:
        """Register a list of search results.

        Expected dict keys: title, authors, year, link, source, snippet,
        and optional chunk metadata: chunk_id, doc_id, page, offset,
        chunk_index, source_paragraph.
        Returns the assigned citation numbers (in input order).
        """
        numbers: List[int] = []
        for r in results:
            num = self.register(
                title=r.get("title", "Unknown Title"),
                authors=r.get("authors", ""),
                year=r.get("year", "N/A"),
                url=r.get("link", ""),
                source=r.get("source", ""),
                snippet=r.get("snippet", ""),
                chunk_id=r.get("chunk_id", ""),
                doc_id=r.get("doc_id", ""),
                page=r.get("page"),
                offset=r.get("offset"),
                chunk_index=r.get("chunk_index"),
                source_paragraph=r.get("source_paragraph", ""),
            )
            numbers.append(num)
        return numbers

    def get(self, number: int) -> Optional[CitationEntry]:
        """Get citation by number."""
        with self._lock:
            return self._entries.get(number)

    def get_all(self) -> List[CitationEntry]:
        """Get all registered citations in number order."""
        with self._lock:
            return [self._entries[k] for k in sorted(self._entries)]

    def is_valid(self, number: int) -> bool:
        """Check if a citation number exists."""
        with self._lock:
            return number in self._entries

    @property
    def count(self) -> int:
        """Total registered citations."""
        with self._lock:
            return len(self._entries)
