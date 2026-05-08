"""Unified exception hierarchy for RAG retrieval operations."""

from __future__ import annotations


class RAGOperationError(Exception):
    """Base exception for all RAG operations."""


class IndexError(RAGOperationError):
    """Failed to build or load a document index."""


class IndexBuildError(IndexError):
    """Document parsing, chunking, or embedding failed."""


class IndexLoadError(IndexError):
    """Persistent index could not be loaded from disk."""


class SearchError(RAGOperationError):
    """An external search source failed."""


class SearchTimeoutError(SearchError):
    """Search request exceeded the allowed timeout."""


class VerificationError(RAGOperationError):
    """Evidence verification (liveness, corroboration) failed."""


class EvidenceCacheError(RAGOperationError):
    """Read/write failure on the evidence cache."""


class ContentVerificationError(RAGOperationError):
    """LLM-based content verification call failed."""


class InsufficientEvidenceError(RAGOperationError):
    """Not enough verified evidence to generate content for a section."""

    def __init__(self, section_title: str, coverage: float, threshold: float = 0.3):
        self.section_title = section_title
        self.coverage = coverage
        self.threshold = threshold
        super().__init__(
            f"Insufficient evidence for '{section_title}': "
            f"coverage {coverage:.0%} < threshold {threshold:.0%}"
        )
