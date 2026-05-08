"""Tests for hybrid retrieval fusion and cache behavior."""

import json
import os
import shutil
import sys
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("JWT_SECRET", "dGVzdC1zZWNyZXQta2V5LWZvci1kZXY=")
os.environ.setdefault("DB_PASSWORD", "test_not_used")
os.environ.setdefault("DB_HOST", "localhost")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.services.search_service import SearchCache, UnifiedAcademicSearcher


QUERIES = {
    "precise": "deep learning medical imaging",
    "general": "deep learning healthcare overview",
    "arxiv": "deep learning neural network medical imaging",
}


def _result(title: str, *, source: str, authors: str = "A Author",
            year: str = "2024", link: str = "", snippet: str = "") -> dict:
    return {
        "title": title,
        "authors": authors,
        "year": year,
        "link": link,
        "source": source,
        "snippet": snippet or f"{title} discusses deep learning medical imaging systems.",
    }


def _make_searcher() -> UnifiedAcademicSearcher:
    return UnifiedAcademicSearcher(
        cache=SearchCache(ttl_seconds=60),
        source_weights={
            "Crossref API": 1.0,
            "OpenAlex": 0.95,
            "Semantic Scholar": 0.9,
            "ArXiv": 0.85,
            "Perplexity Sonar": 0.7,
            "Google Scholar": 0.6,
        },
    )


class TestHybridSearchFusion:
    def test_run_ensemble_search_ranks_fused_results_and_prefers_higher_confidence_metadata(self):
        searcher = _make_searcher()

        crossref_results = [
            _result(
                "Reliable Deep Learning Imaging Review",
                source="Crossref API",
                authors="Alice Smith, Bob Lee",
                link="https://doi.org/10.1000/reliable",
            ),
        ]
        openalex_results = [
            _result(
                "Reliable Deep Learning Imaging Review for Clinical Practice",
                source="OpenAlex",
                authors="Alice Smith, Bob Lee",
                link="https://doi.org/10.1000/reliable",
            ),
        ]
        semantic_results = [
            _result(
                "Evidence-based Medical AI Review",
                source="Semantic Scholar",
                link="https://example.com/evidence",
            ),
        ]
        google_results = [
            _result(
                "Fallback Web Overview",
                source="Google Scholar",
                link="https://example.com/fallback",
            ),
        ]

        with patch.object(searcher, "search_crossref", return_value=crossref_results), \
             patch.object(searcher, "search_openalex", return_value=openalex_results), \
             patch.object(searcher, "search_semantic_scholar_public", return_value=semantic_results), \
             patch.object(searcher, "search_arxiv", return_value=[]), \
             patch.object(searcher, "search_perplexity_sonar", return_value=[]), \
             patch.object(searcher, "search_google_serp", return_value=google_results):
            results = searcher.run_ensemble_search(QUERIES, limit=3)

        assert [item["title"] for item in results] == [
            "Reliable Deep Learning Imaging Review",
            "Evidence-based Medical AI Review",
            "Fallback Web Overview",
        ]
        assert results[0]["source"] == "Crossref API"
        assert len(results) == 3

    def test_run_ensemble_search_dedups_near_identical_titles_without_shared_url(self):
        searcher = _make_searcher()

        crossref_results = [
            _result(
                "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
                source="Crossref API",
                authors="Jacob Devlin, Ming-Wei Chang",
                year="2018",
                link="",
            ),
        ]
        semantic_results = [
            _result(
                "BERT: Pre-training of Deep Bidirectional Transformers",
                source="Semantic Scholar",
                authors="Jacob Devlin, Ming-Wei Chang",
                year="2018",
                link="",
            ),
        ]

        with patch.object(searcher, "search_crossref", return_value=crossref_results), \
             patch.object(searcher, "search_openalex", return_value=[]), \
             patch.object(searcher, "search_semantic_scholar_public", return_value=semantic_results), \
             patch.object(searcher, "search_arxiv", return_value=[]), \
             patch.object(searcher, "search_perplexity_sonar", return_value=[]), \
             patch.object(searcher, "search_google_serp", return_value=[]):
            results = searcher.run_ensemble_search(QUERIES, limit=3)

        assert len(results) == 1
        assert results[0]["source"] == "Crossref API"


class TestSearchCache:
    def test_search_cache_persists_to_disk_and_returns_copies(self):
        cache_dir = Path(__file__).resolve().parent / ".search-cache-test"
        shutil.rmtree(cache_dir, ignore_errors=True)

        cache = SearchCache(ttl_seconds=120, cache_dir=str(cache_dir))
        results = [_result("Persistent Paper", source="Crossref API", link="https://doi.org/10.1000/cache")]
        extra = {"fusion_version": "weighted_rrf_v2", "weights": {"Crossref API": 1.0}}

        try:
            cache.put(QUERIES, 5, results, extra=extra)
            assert any(cache_dir.glob("*.json"))

            reloaded = SearchCache(ttl_seconds=120, cache_dir=str(cache_dir))
            loaded = reloaded.get(QUERIES, 5, extra=extra)
            assert loaded == results

            loaded[0]["title"] = "Mutated"
            again = reloaded.get(QUERIES, 5, extra=extra)
            assert again[0]["title"] == "Persistent Paper"
        finally:
            shutil.rmtree(cache_dir, ignore_errors=True)

    def test_search_cache_expires_stale_disk_entries(self):
        cache_dir = Path(__file__).resolve().parent / ".search-cache-expired"
        shutil.rmtree(cache_dir, ignore_errors=True)

        cache = SearchCache(ttl_seconds=1, cache_dir=str(cache_dir))
        results = [_result("Old Paper", source="Crossref API")]
        extra = {"fusion_version": "weighted_rrf_v2"}

        try:
            cache.put(QUERIES, 5, results, extra=extra)
            key = cache._make_key(QUERIES, 5, extra=extra)
            path = cache._cache_path(key)
            with path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            payload["ts"] = 0
            with path.open("w", encoding="utf-8") as fh:
                json.dump(payload, fh)

            reloaded = SearchCache(ttl_seconds=1, cache_dir=str(cache_dir))
            assert reloaded.get(QUERIES, 5, extra=extra) is None
            assert not path.exists()
        finally:
            shutil.rmtree(cache_dir, ignore_errors=True)
