"""
Search Result Verifier — assigns SourceTier and VerificationStatus to web results.

Three-layer verification:
1. Source tier classification (A/B+/B/C based on search source)
2. Cross-source corroboration (multi-source hits get higher trust)
3. DOI/URL liveness check (optional, for high-value results)

Results are annotated in-place with `_source_tier`, `_verification_status`,
and `_corroboration_sources` keys for downstream consumption.
"""

from __future__ import annotations

import logging
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Optional
from urllib.parse import urlparse

import requests

from intelligen_engine.pipeline.retrieval.evidence import (
    SOURCE_TIER_MAP,
    SourceTier,
    VerificationStatus,
)

logger = logging.getLogger(__name__)

# DOI resolver base URL
_DOI_RESOLVE_URL = "https://doi.org/"
# Domains known to host papers — liveness check is usually reliable
_SCHOLARLY_DOMAINS = frozenset({
    "doi.org", "arxiv.org", "ncbi.nlm.nih.gov", "pubmed.ncbi.nlm.nih.gov",
    "semanticscholar.org", "openalex.org", "crossref.org",
    "springer.com", "wiley.com", "sciencedirect.com", "nature.com",
    "ieee.org", "acm.org", "jstor.org", "tandfonline.com",
})

# How many results we'll bother running liveness checks on
_MAX_LIVENESS_CHECKS = 8
# Timeout for liveness HEAD requests (seconds)
_LIVENESS_TIMEOUT = 5


def classify_source_tier(source_name: str) -> SourceTier:
    """Map a search source display name to its authority tier."""
    return SOURCE_TIER_MAP.get(source_name, SourceTier.C)


def determine_verification_status(
    *,
    source_tier: SourceTier,
    source_count: int,
    liveness_ok: Optional[bool] = None,
) -> VerificationStatus:
    """Decide verification status from tier, corroboration, and liveness.

    Rules:
    - Tier A + 2+ sources → VERIFIED
    - Tier A or B+ with 1 source → LIKELY_VALID
    - Tier B with 1 source → UNVERIFIED (needs corroboration)
    - Tier C with 1 source → SUSPICIOUS
    - Any tier with 2+ sources → at least LIKELY_VALID
    - Liveness failure on a single-source result → SUSPICIOUS
    """
    if source_count >= 2:
        if source_tier in (SourceTier.A, SourceTier.B_PLUS):
            return VerificationStatus.VERIFIED
        return VerificationStatus.LIKELY_VALID

    # Single source
    if liveness_ok is False:
        return VerificationStatus.SUSPICIOUS

    if source_tier == SourceTier.A:
        return VerificationStatus.LIKELY_VALID
    if source_tier == SourceTier.B_PLUS:
        return VerificationStatus.LIKELY_VALID
    if source_tier == SourceTier.B:
        return VerificationStatus.UNVERIFIED
    return VerificationStatus.SUSPICIOUS


def _extract_doi(result: Dict) -> Optional[str]:
    """Try to extract a DOI from the result URL or link."""
    link = result.get("link", "")
    # Direct DOI URL pattern
    doi_match = re.search(r"(?:doi\.org/|DOI:\s*)(10\.\d{4,}/[^\s]+)", link, re.IGNORECASE)
    if doi_match:
        return doi_match.group(1).rstrip(".")
    return None


def _check_url_liveness(url: str) -> bool:
    """HEAD request to check if URL is reachable (2xx/3xx = alive)."""
    if not url or not url.startswith("http"):
        return False
    try:
        resp = requests.head(
            url, timeout=_LIVENESS_TIMEOUT,
            allow_redirects=True, verify=False,
            headers={"User-Agent": "IntelliGen-Verifier/1.0"},
        )
        return resp.status_code < 400
    except Exception:
        return False


def _is_scholarly_url(url: str) -> bool:
    """Check if a URL belongs to a known scholarly domain."""
    try:
        host = urlparse(url).hostname or ""
        return any(host.endswith(d) for d in _SCHOLARLY_DOMAINS)
    except Exception:
        return False


def verify_search_results(
    results: List[Dict],
    *,
    check_liveness: bool = True,
    max_liveness_checks: int = _MAX_LIVENESS_CHECKS,
) -> List[Dict]:
    """Annotate search results with verification metadata.

    Adds to each result dict:
      - `_source_tier`: SourceTier value string
      - `_verification_status`: VerificationStatus value string
      - `_liveness_checked`: bool
      - `_doi`: extracted DOI or None

    Args:
        results: List of fused search result dicts from UnifiedAcademicSearcher.
        check_liveness: Whether to perform URL liveness checks.
        max_liveness_checks: Cap on how many results get liveness checks.

    Returns:
        The same list, annotated in-place.
    """
    if not results:
        return results

    # Phase 1: Tier classification + corroboration-based status
    for r in results:
        source_name = r.get("source", "")
        tier = classify_source_tier(source_name)
        source_count = r.get("_source_count", 1)
        doi = _extract_doi(r)

        r["_source_tier"] = tier.value
        r["_doi"] = doi
        r["_liveness_checked"] = False
        # Preliminary status (may be upgraded/downgraded by liveness)
        r["_verification_status"] = determine_verification_status(
            source_tier=tier,
            source_count=source_count,
        ).value

    # Phase 2: Liveness checks (concurrent, capped)
    if check_liveness:
        # Prioritize single-source and lower-tier results for liveness checks
        candidates = [
            r for r in results
            if r.get("link") and r.get("_source_count", 1) <= 1
        ][:max_liveness_checks]

        if candidates:
            liveness_map: Dict[int, bool] = {}
            with ThreadPoolExecutor(max_workers=4) as pool:
                futures = {
                    pool.submit(_check_url_liveness, r["link"]): id(r)
                    for r in candidates
                }
                try:
                    for future in as_completed(futures, timeout=_LIVENESS_TIMEOUT * 2):
                        result_id = futures[future]
                        try:
                            liveness_map[result_id] = future.result(timeout=_LIVENESS_TIMEOUT)
                        except Exception:
                            liveness_map[result_id] = False
                except TimeoutError:
                    logger.warning("Liveness check pool timed out, skipping remaining checks")

            # Update status based on liveness
            for r in candidates:
                alive = liveness_map.get(id(r))
                if alive is not None:
                    r["_liveness_checked"] = True
                    tier = classify_source_tier(r.get("source", ""))
                    r["_verification_status"] = determine_verification_status(
                        source_tier=tier,
                        source_count=r.get("_source_count", 1),
                        liveness_ok=alive,
                    ).value

    # Log summary
    status_counts: Dict[str, int] = {}
    for r in results:
        s = r.get("_verification_status", "unknown")
        status_counts[s] = status_counts.get(s, 0) + 1
    logger.info(f"🔍 Verification: {len(results)} results — {status_counts}")

    # Phase 3: Compute composite verification score per result
    for r in results:
        tier = classify_source_tier(r.get("source", ""))
        source_count = r.get("_source_count", 1)
        liveness = (
            r.get("_liveness_checked", False)
            and r.get("_verification_status") != "suspicious"
        )

        # Base score from tier
        tier_scores = {
            SourceTier.A: 0.9,
            SourceTier.B_PLUS: 0.75,
            SourceTier.B: 0.6,
            SourceTier.C: 0.3,
        }
        base = tier_scores.get(tier, 0.3)

        # Corroboration bonus (capped at +0.3)
        corroboration = min(source_count - 1, 3) * 0.1

        # Liveness bonus/penalty
        if r.get("_liveness_checked") and liveness:
            liveness_mod = 0.05
        elif r.get("_liveness_checked"):
            liveness_mod = -0.1
        else:
            liveness_mod = 0

        # DOI bonus
        doi_bonus = 0.1 if r.get("_doi") else 0

        # Scholarly URL bonus
        scholarly_bonus = 0.05 if _is_scholarly_url(r.get("link", "")) else 0

        score = min(max(base + corroboration + liveness_mod + doi_bonus + scholarly_bonus, 0.0), 1.0)
        r["_verification_score"] = round(score, 3)

    return results
