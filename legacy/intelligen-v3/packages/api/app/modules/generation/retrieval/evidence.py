"""
Evidence model — unified representation for all evidence items (local + web).

Every piece of evidence flowing through the RAG pipeline is represented as an
EvidenceItem. This replaces the loose dict-based approach and enables:
- Chunk-level attribution (not just file-level)
- Verification status tracking
- Source tier classification
- Consistent handling across retrieve → write → verify → normalize
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


class SourceTier(str, enum.Enum):
    """Authority tier for search sources."""
    A = "A"     # Crossref, OpenAlex, Semantic Scholar, local uploads
    B_PLUS = "B+"  # ArXiv (real but unreviewed)
    B = "B"     # Google Scholar
    C = "C"     # LLM-based search (Perplexity Sonar)


class VerificationStatus(str, enum.Enum):
    """Verification state of an evidence item."""
    VERIFIED = "verified"           # Multi-source confirmed
    LIKELY_VALID = "likely_valid"   # Single trusted source, no contradictions
    UNVERIFIED = "unverified"       # Single source, not cross-checked
    SUSPICIOUS = "suspicious"       # Only from Tier C, no corroboration
    RETRACTED = "retracted"         # DOI resolved to retracted paper


# Map search source display names → tier
SOURCE_TIER_MAP: dict[str, SourceTier] = {
    "Crossref API": SourceTier.A,
    "OpenAlex": SourceTier.A,
    "Semantic Scholar": SourceTier.A,
    "ArXiv": SourceTier.B_PLUS,
    "Google Scholar": SourceTier.B,
    "Perplexity Sonar": SourceTier.C,
    "Local Knowledge Base": SourceTier.A,
}


@dataclass
class EvidenceItem:
    """A single piece of evidence — local chunk or web search result."""

    id: str                          # Stable unique ID (content_hash + chunk_index, or search result hash)
    source: str                      # Source system name (e.g. "Crossref API", "Local Knowledge Base")
    source_tier: SourceTier          # Authority tier
    title: str                       # Paper title or source filename
    content: str                     # Actual text content (chunk text or snippet)
    authors: str = ""
    year: str = ""
    url: str = ""
    doi: str = ""

    # Local document metadata
    doc_id: Optional[str] = None     # Document content hash
    chunk_id: Optional[str] = None   # Chunk-level ID
    chunk_index: Optional[int] = None
    page: Optional[int] = None
    offset: Optional[int] = None
    source_filename: Optional[str] = None

    # Retrieval metadata
    score: float = 0.0               # Retrieval similarity / relevance score

    # Verification
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    verified_at: Optional[datetime] = None
    corroboration_sources: list[str] = field(default_factory=list)
    liveness_checked: bool = False
    expires_at: Optional[datetime] = None

    def is_expired(self) -> bool:
        """Whether this evidence has passed its expiration time."""
        if self.expires_at is None:
            return False
        return self.expires_at < datetime.now()

    @property
    def is_local(self) -> bool:
        return self.doc_id is not None

    @property
    def is_trustworthy(self) -> bool:
        """Whether this evidence is safe to use in generation."""
        return self.verification_status in (
            VerificationStatus.VERIFIED,
            VerificationStatus.LIKELY_VALID,
        )

    def to_registry_dict(self) -> dict:
        """Convert to the dict format expected by CitationRegistry.register()."""
        return {
            "title": self.title,
            "authors": self.authors,
            "year": self.year,
            "link": self.url,
            "source": self.source,
            "snippet": self.content[:200] if self.content else "",
        }
