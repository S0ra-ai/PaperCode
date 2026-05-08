"""Tests for EvidenceCache — caching, TTL, domain-aware expiry, cleanup."""

import json
import os
import sys
import tempfile
import time

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.retrieval.evidence import VerificationStatus
from app.modules.generation.retrieval.evidence_cache import (
    EvidenceCache,
    _normalize_query,
    _query_hash,
    _detect_domain_ttl,
)


class TestNormalizeQuery:

    def test_lowercases_and_collapses_whitespace(self):
        assert _normalize_query("  Hello   World ") == "hello world"

    def test_already_normalized(self):
        assert _normalize_query("hello world") == "hello world"


class TestQueryHash:

    def test_deterministic(self):
        h1 = _query_hash("test query")
        h2 = _query_hash("test query")
        assert h1 == h2

    def test_different_namespace(self):
        h1 = _query_hash("test query", "ns1")
        h2 = _query_hash("test query", "ns2")
        assert h1 != h2

    def test_length(self):
        h = _query_hash("test")
        assert len(h) == 24


class TestDetectDomainTtl:

    def test_ai_domain_shorter(self):
        ttl = _detect_domain_ttl("machine learning transformers", 30)
        assert ttl == 14

    def test_normal_domain_uses_default(self):
        ttl = _detect_domain_ttl("organic chemistry synthesis", 30)
        assert ttl == 30

    def test_covid_very_short(self):
        ttl = _detect_domain_ttl("covid vaccine efficacy", 30)
        assert ttl == 7


class TestEvidenceCache:

    @pytest.fixture
    def cache(self, tmp_path):
        return EvidenceCache(cache_dir=str(tmp_path), default_ttl_days=1)

    def _make_results(self, count=2, status="verified"):
        return [
            {
                "title": f"Paper {i}",
                "source": "Crossref API",
                "link": f"https://doi.org/10.1234/{i}",
                "_source_tier": "A",
                "_verification_status": status,
            }
            for i in range(count)
        ]

    def test_put_and_get(self, cache):
        results = self._make_results(3)
        cached = cache.put("machine learning", results)
        assert cached == 3

        retrieved = cache.get("machine learning")
        assert retrieved is not None
        assert len(retrieved) == 3
        assert retrieved[0]["title"] == "Paper 0"

    def test_get_miss(self, cache):
        assert cache.get("nonexistent query") is None

    def test_only_caches_verified(self, cache):
        results = self._make_results(2, status="suspicious")
        cached = cache.put("test", results)
        assert cached == 0

    def test_expired_returns_none(self, cache, tmp_path):
        # Write a cache file that's already expired
        results = self._make_results(1)
        cache.put("expired query", results)
        # Manually set expires_at to the past
        qhash = _query_hash("expired query")
        cache_file = tmp_path / "_evidence_cache" / "default" / f"{qhash}.json"
        with open(cache_file, "r") as f:
            entries = json.load(f)
        entries[0]["expires_at"] = time.time() - 100
        with open(cache_file, "w") as f:
            json.dump(entries, f)

        assert cache.get("expired query") is None

    def test_invalidate(self, cache):
        cache.put("to delete", self._make_results(1))
        assert cache.get("to delete") is not None
        assert cache.invalidate("to delete") is True
        assert cache.get("to delete") is None

    def test_invalidate_nonexistent(self, cache):
        assert cache.invalidate("not there") is False

    def test_cleanup_expired(self, cache, tmp_path):
        results = self._make_results(1)
        cache.put("fresh", results)
        cache.put("old", results)
        # Force-expire 'old'
        qhash = _query_hash("old")
        cache_file = tmp_path / "_evidence_cache" / "default" / f"{qhash}.json"
        with open(cache_file, "r") as f:
            entries = json.load(f)
        entries[0]["expires_at"] = time.time() - 100
        with open(cache_file, "w") as f:
            json.dump(entries, f)
        # Touch file mtime to make it old enough to pass stat pre-filter
        old_time = time.time() - (8 * 86400)
        os.utime(cache_file, (old_time, old_time))

        removed = cache.cleanup_expired()
        assert removed == 1
        assert cache.get("fresh") is not None
