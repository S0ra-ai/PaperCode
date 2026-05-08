"""Tests for SearchVerifier — source tier classification and verification status."""

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.retrieval.evidence import SourceTier, VerificationStatus
from app.modules.generation.retrieval.search_verifier import (
    classify_source_tier,
    determine_verification_status,
    _extract_doi,
    _is_scholarly_url,
    verify_search_results,
)


class TestClassifySourceTier:

    def test_crossref_is_tier_a(self):
        assert classify_source_tier("Crossref API") == SourceTier.A

    def test_openalex_is_tier_a(self):
        assert classify_source_tier("OpenAlex") == SourceTier.A

    def test_arxiv_is_tier_b_plus(self):
        assert classify_source_tier("ArXiv") == SourceTier.B_PLUS

    def test_google_scholar_is_tier_b(self):
        assert classify_source_tier("Google Scholar") == SourceTier.B

    def test_perplexity_is_tier_c(self):
        assert classify_source_tier("Perplexity Sonar") == SourceTier.C

    def test_unknown_defaults_to_c(self):
        assert classify_source_tier("UnknownEngine") == SourceTier.C


class TestDetermineVerificationStatus:

    def test_multi_source_tier_a_is_verified(self):
        result = determine_verification_status(
            source_tier=SourceTier.A, source_count=2
        )
        assert result == VerificationStatus.VERIFIED

    def test_multi_source_tier_c_is_likely_valid(self):
        result = determine_verification_status(
            source_tier=SourceTier.C, source_count=3
        )
        assert result == VerificationStatus.LIKELY_VALID

    def test_single_tier_a_is_likely_valid(self):
        result = determine_verification_status(
            source_tier=SourceTier.A, source_count=1
        )
        assert result == VerificationStatus.LIKELY_VALID

    def test_single_tier_b_is_unverified(self):
        result = determine_verification_status(
            source_tier=SourceTier.B, source_count=1
        )
        assert result == VerificationStatus.UNVERIFIED

    def test_single_tier_c_is_suspicious(self):
        result = determine_verification_status(
            source_tier=SourceTier.C, source_count=1
        )
        assert result == VerificationStatus.SUSPICIOUS

    def test_liveness_failure_downgrades(self):
        result = determine_verification_status(
            source_tier=SourceTier.A, source_count=1, liveness_ok=False
        )
        assert result == VerificationStatus.SUSPICIOUS

    def test_liveness_ok_no_effect_on_tier_a(self):
        result = determine_verification_status(
            source_tier=SourceTier.A, source_count=1, liveness_ok=True
        )
        assert result == VerificationStatus.LIKELY_VALID


class TestExtractDoi:

    def test_doi_from_url(self):
        r = {"link": "https://doi.org/10.1234/example.paper"}
        assert _extract_doi(r) == "10.1234/example.paper"

    def test_no_doi(self):
        r = {"link": "https://arxiv.org/abs/2301.12345"}
        assert _extract_doi(r) is None

    def test_empty_link(self):
        assert _extract_doi({"link": ""}) is None
        assert _extract_doi({}) is None


class TestIsScholarlyUrl:

    def test_arxiv_is_scholarly(self):
        assert _is_scholarly_url("https://arxiv.org/abs/2301.12345") is True

    def test_random_domain_is_not(self):
        assert _is_scholarly_url("https://example.com/paper") is False

    def test_doi_org_is_scholarly(self):
        assert _is_scholarly_url("https://doi.org/10.1234/foo") is True


class TestVerifySearchResults:

    def test_empty_returns_empty(self):
        assert verify_search_results([], check_liveness=False) == []

    def test_annotates_results(self):
        results = [
            {"title": "Test", "source": "Crossref API", "link": "https://doi.org/10.1234/x", "_source_count": 2},
            {"title": "Test2", "source": "Perplexity Sonar", "link": "https://example.com", "_source_count": 1},
        ]
        annotated = verify_search_results(results, check_liveness=False)
        assert len(annotated) == 2
        assert annotated[0]["_source_tier"] == SourceTier.A.value
        assert annotated[0]["_verification_status"] == VerificationStatus.VERIFIED.value
        assert annotated[1]["_source_tier"] == SourceTier.C.value
        assert annotated[1]["_verification_status"] == VerificationStatus.SUSPICIOUS.value

    def test_liveness_checked_false_when_disabled(self):
        results = [{"title": "X", "source": "Crossref API", "link": "https://doi.org/10.1234/y"}]
        verify_search_results(results, check_liveness=False)
        assert results[0]["_liveness_checked"] is False
