"""Tests for EvidenceItem and SourceTier models."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.retrieval.evidence import (
    EvidenceItem,
    SourceTier,
    VerificationStatus,
    SOURCE_TIER_MAP,
)


class TestSourceTier:

    def test_all_enum_values(self):
        assert SourceTier.A.value == "A"
        assert SourceTier.B_PLUS.value == "B+"
        assert SourceTier.B.value == "B"
        assert SourceTier.C.value == "C"

    def test_source_tier_map_covers_known_sources(self):
        expected_sources = {"Crossref API", "OpenAlex", "Semantic Scholar", "ArXiv"}
        for src in expected_sources:
            assert src in SOURCE_TIER_MAP, f"Missing source tier mapping for {src}"

    def test_perplexity_is_tier_c(self):
        assert SOURCE_TIER_MAP.get("Perplexity Sonar") == SourceTier.C


class TestVerificationStatus:

    def test_all_enum_values(self):
        statuses = {s.value for s in VerificationStatus}
        assert "verified" in statuses
        assert "likely_valid" in statuses
        assert "unverified" in statuses
        assert "suspicious" in statuses


class TestEvidenceItem:

    def _make_item(self, **overrides):
        defaults = dict(
            id="chunk-001",
            source="Crossref API",
            source_tier=SourceTier.A,
            title="Sample Paper",
            content="This is evidence content.",
        )
        defaults.update(overrides)
        return EvidenceItem(**defaults)

    def test_defaults(self):
        item = self._make_item()
        assert item.verification_status == VerificationStatus.UNVERIFIED
        assert item.score == 0.0
        assert item.doc_id is None
        assert item.chunk_id is None

    def test_custom_score(self):
        item = self._make_item(score=0.85)
        assert item.score == 0.85

    def test_verification_status_override(self):
        item = self._make_item(verification_status=VerificationStatus.VERIFIED)
        assert item.verification_status == VerificationStatus.VERIFIED

    def test_chunk_metadata(self):
        item = self._make_item(
            doc_id="abc123",
            chunk_id="chunk-42",
            chunk_index=3,
            page=7,
            offset=1024,
        )
        assert item.doc_id == "abc123"
        assert item.chunk_index == 3
        assert item.page == 7
