"""
Hybrid Ranker — combines multiple ranking signals for evidence selection.

Signals:
1. Dense retrieval score (FAISS cosine similarity)
2. Lexical matching score (keyword overlap / TF-IDF-like)
3. Source credibility score (tier-based)
4. Recency score (newer = higher)
5. Cross-reference count (more sources = higher)

Configurable weights per signal, final ranked list per section.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set

logger = logging.getLogger(__name__)


@dataclass
class RankingSignals:
    """Individual ranking signals for a single result."""
    dense_score: float = 0.0       # From FAISS similarity
    lexical_score: float = 0.0     # Keyword overlap
    credibility_score: float = 0.0  # Source tier
    recency_score: float = 0.0     # Publication year
    cross_ref_score: float = 0.0   # Multi-source corroboration


@dataclass
class RankedResult:
    """A search result with computed ranking signals and final score."""
    result: Dict
    signals: RankingSignals = field(default_factory=RankingSignals)
    final_score: float = 0.0


@dataclass
class RankingWeights:
    """Configurable weights for each ranking signal."""
    dense: float = 0.35
    lexical: float = 0.20
    credibility: float = 0.20
    recency: float = 0.10
    cross_ref: float = 0.15

    def normalize(self) -> "RankingWeights":
        """Normalize weights to sum to 1.0."""
        total = self.dense + self.lexical + self.credibility + self.recency + self.cross_ref
        if total <= 0:
            return RankingWeights()
        return RankingWeights(
            dense=self.dense / total,
            lexical=self.lexical / total,
            credibility=self.credibility / total,
            recency=self.recency / total,
            cross_ref=self.cross_ref / total,
        )


class HybridRanker:
    """Combines multiple ranking signals to produce a final relevance ranking."""

    # Source tier → credibility score mapping
    TIER_SCORES = {"A": 1.0, "B+": 0.8, "B": 0.6, "C": 0.3}

    def __init__(self, weights: Optional[RankingWeights] = None):
        self.weights = (weights or RankingWeights()).normalize()

    def rank(
        self,
        results: List[Dict],
        query: str,
        *,
        top_k: int = 10,
        current_year: int = 2025,
    ) -> List[RankedResult]:
        """Rank results using hybrid signals.

        Args:
            results: Search results with optional verification metadata
            query: The search query (for lexical scoring)
            top_k: Number of top results to return
            current_year: Current year for recency calculation

        Returns:
            Ranked list of RankedResult objects
        """
        if not results:
            return []

        query_terms = self._tokenize(query)
        ranked: List[RankedResult] = []

        for r in results:
            signals = RankingSignals(
                dense_score=self._compute_dense_score(r),
                lexical_score=self._compute_lexical_score(r, query_terms),
                credibility_score=self._compute_credibility_score(r),
                recency_score=self._compute_recency_score(r, current_year),
                cross_ref_score=self._compute_cross_ref_score(r),
            )

            final = (
                self.weights.dense * signals.dense_score
                + self.weights.lexical * signals.lexical_score
                + self.weights.credibility * signals.credibility_score
                + self.weights.recency * signals.recency_score
                + self.weights.cross_ref * signals.cross_ref_score
            )

            ranked.append(RankedResult(result=r, signals=signals, final_score=round(final, 4)))

        ranked.sort(key=lambda x: x.final_score, reverse=True)
        return ranked[:top_k]

    def _compute_dense_score(self, result: Dict) -> float:
        """Use existing verification score or RRF score as dense proxy."""
        score = result.get("_verification_score", 0.0) or result.get("_rrf_score", 0.0)
        return min(max(float(score), 0.0), 1.0)

    def _compute_lexical_score(self, result: Dict, query_terms: Set[str]) -> float:
        """Keyword overlap between query and result title/snippet."""
        if not query_terms:
            return 0.0
        title = result.get("title", "")
        snippet = result.get("snippet", "")
        result_terms = self._tokenize(f"{title} {snippet}")
        if not result_terms:
            return 0.0
        overlap = len(query_terms & result_terms)
        return min(overlap / max(len(query_terms), 1), 1.0)

    def _compute_credibility_score(self, result: Dict) -> float:
        """Score based on source tier and verification status."""
        tier = result.get("_source_tier", "C")
        base = self.TIER_SCORES.get(tier, 0.3)

        status = result.get("_verification_status", "unverified")
        status_bonus = {
            "verified": 0.2, "likely_valid": 0.1,
            "unverified": 0.0, "suspicious": -0.2,
        }
        return min(max(base + status_bonus.get(status, 0.0), 0.0), 1.0)

    def _compute_recency_score(self, result: Dict, current_year: int) -> float:
        """Score based on publication year (newer = higher)."""
        year_str = str(result.get("year", ""))
        try:
            year = int(year_str[:4])
            age = max(current_year - year, 0)
            # Sigmoid-like decay: recent papers score high, old ones taper off
            return max(1.0 / (1.0 + age * 0.15), 0.1)
        except (ValueError, TypeError):
            return 0.3  # Unknown year gets neutral score

    def _compute_cross_ref_score(self, result: Dict) -> float:
        """Score based on how many sources found this result."""
        count = result.get("_source_count", 1)
        # Diminishing returns: 1→0.2, 2→0.6, 3→0.8, 4+→0.9+
        return min(1.0 - 1.0 / (1.0 + count * 0.5), 1.0)

    @staticmethod
    def _tokenize(text: str) -> Set[str]:
        """Simple tokenizer for keyword overlap scoring."""
        if not text:
            return set()
        text = re.sub(r'[^\w\s]', ' ', text.lower())
        tokens = text.split()
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'of', 'in', 'to', 'for',
            'on', 'with', 'is', 'by', 'at', 'from', 'as', 'be',
        }
        return {t for t in tokens if len(t) > 1 and t not in stop_words}
