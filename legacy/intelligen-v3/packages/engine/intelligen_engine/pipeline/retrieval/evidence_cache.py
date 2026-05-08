"""
Evidence Cache — verified knowledge reuse across tasks.

Caches verified search results (VerificationStatus.VERIFIED or LIKELY_VALID)
to avoid re-searching and re-verifying for similar topics. Implements:
- Content-addressed storage (cache key = normalized query hash)
- TTL-based expiration (default 30 days, configurable)
- Domain-aware TTL (fast-moving fields expire sooner)
- Namespace isolation for multi-tenant safety
- Only caches results that passed verification
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from threading import RLock
from typing import Dict, List, Optional

import structlog

from intelligen_engine.pipeline.retrieval.evidence import VerificationStatus
from intelligen_engine.core.config import settings

logger = structlog.get_logger(__name__)

# Domain keywords → shorter TTL (days) for fast-moving fields
_DOMAIN_TTL_OVERRIDES: Dict[str, int] = {
    "artificial intelligence": 14,
    "machine learning": 14,
    "deep learning": 14,
    "llm": 14,
    "large language model": 14,
    "covid": 7,
    "pandemic": 7,
    "cryptocurrency": 7,
    "blockchain": 14,
}

# Statuses eligible for caching/reuse
_CACHEABLE_STATUSES = frozenset({
    VerificationStatus.VERIFIED.value,
    VerificationStatus.LIKELY_VALID.value,
})


@dataclass
class CachedEvidenceEntry:
    """A single cached evidence record."""
    query_hash: str
    query_text: str
    result: Dict          # Original search result dict
    source_tier: str
    verification_status: str
    cached_at: float      # Unix timestamp
    expires_at: float     # Unix timestamp
    namespace: str = "default"


def _normalize_query(query: str) -> str:
    """Normalize a query for cache key generation."""
    return " ".join(query.lower().split())


def _query_hash(query: str, namespace: str = "default") -> str:
    """Deterministic cache key from normalized query + namespace."""
    normalized = _normalize_query(query)
    return hashlib.sha256(f"{namespace}:{normalized}".encode()).hexdigest()[:24]


def _detect_domain_ttl(query: str, default_days: int) -> int:
    """Return a shorter TTL if the query matches a fast-moving domain."""
    q_lower = query.lower()
    for domain_keyword, ttl_days in _DOMAIN_TTL_OVERRIDES.items():
        if domain_keyword in q_lower:
            return min(ttl_days, default_days)
    return default_days


class EvidenceCache:
    """File-backed cache of verified search results for cross-task reuse.

    Directory layout:
        {cache_dir}/{namespace}/{query_hash}.json
    """

    def __init__(self, cache_dir: Optional[str] = None, default_ttl_days: Optional[int] = None):
        self._cache_dir = Path(
            cache_dir or getattr(settings, "RAG_INDEX_DIR", "data/indexes")
        ) / "_evidence_cache"
        self._default_ttl_days = default_ttl_days or getattr(settings, "RAG_INDEX_TTL_DAYS", 30)
        self._lock = RLock()
        self._cache_dir.mkdir(parents=True, exist_ok=True)

    def _namespace_dir(self, namespace: str) -> Path:
        safe = namespace.replace("/", "_").replace("\\", "_")
        d = self._cache_dir / safe
        d.mkdir(parents=True, exist_ok=True)
        return d

    def put(
        self,
        query: str,
        results: List[Dict],
        namespace: str = "default",
    ) -> int:
        """Cache verified results for a query. Returns count of cached items."""
        if not results:
            return 0

        qhash = _query_hash(query, namespace)
        ttl_days = _detect_domain_ttl(query, self._default_ttl_days)
        now = time.time()
        expires_at = now + ttl_days * 86400

        entries = []
        for r in results:
            status = r.get("_verification_status", "unverified")
            if status not in _CACHEABLE_STATUSES:
                continue
            entries.append(asdict(CachedEvidenceEntry(
                query_hash=qhash,
                query_text=_normalize_query(query),
                result=r,
                source_tier=r.get("_source_tier", "C"),
                verification_status=status,
                cached_at=now,
                expires_at=expires_at,
                namespace=namespace,
            )))

        if not entries:
            return 0

        cache_file = self._namespace_dir(namespace) / f"{qhash}.json"
        with self._lock:
            try:
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(entries, f, ensure_ascii=False, indent=2)
                logger.info("cache_write", query_hash=qhash[:12], count=len(entries))
            except Exception as e:
                logger.warning("cache_write_failed", error=str(e))
                return 0
        return len(entries)

    def get(
        self,
        query: str,
        namespace: str = "default",
    ) -> Optional[List[Dict]]:
        """Retrieve cached results for a query. Returns None on miss or expiry."""
        qhash = _query_hash(query, namespace)
        cache_file = self._namespace_dir(namespace) / f"{qhash}.json"

        if not cache_file.exists():
            return None

        with self._lock:
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    entries = json.load(f)
            except Exception:
                return None

        if not entries:
            return None

        now = time.time()

        # Filter out individually expired entries
        valid_entries = [
            e for e in entries
            if e.get("expires_at") is None or e["expires_at"] >= now
        ]

        if not valid_entries:
            logger.info("cache_expired", query_hash=qhash[:12])
            try:
                cache_file.unlink(missing_ok=True)
            except Exception:
                pass
            return None

        expired_count = len(entries) - len(valid_entries)
        if expired_count > 0:
            logger.info(
                "cache_partial_expiry",
                query_hash=qhash[:12],
                expired=expired_count,
                remaining=len(valid_entries),
            )

        results = [e["result"] for e in valid_entries if isinstance(e.get("result"), dict)]
        if results:
            logger.info("cache_hit", query_hash=qhash[:12], count=len(results))
        return results or None

    def cleanup_expired(self) -> int:
        """Remove all expired cache entries. Uses file mtime as fast pre-filter
        before reading JSON, avoiding unnecessary I/O for recently-written files."""
        removed = 0
        now = time.time()
        with self._lock:
            for ns_dir in self._cache_dir.iterdir():
                if not ns_dir.is_dir() or ns_dir.name.startswith("."):
                    continue
                for cache_file in ns_dir.glob("*.json"):
                    try:
                        # Fast pre-filter: if file was modified recently, skip
                        # (it can't be expired if written within the minimum TTL)
                        mtime = cache_file.stat().st_mtime
                        min_ttl_seconds = 7 * 86400  # shortest domain TTL
                        if now - mtime < min_ttl_seconds:
                            continue

                        with open(cache_file, "r", encoding="utf-8") as f:
                            entries = json.load(f)
                        if entries and entries[0].get("expires_at", 0) < now:
                            cache_file.unlink()
                            removed += 1
                    except Exception:
                        pass
        if removed:
            logger.info("cache_cleanup", removed=removed)
        return removed

    def invalidate(self, query: str, namespace: str = "default") -> bool:
        """Force-invalidate cached results for a query."""
        qhash = _query_hash(query, namespace)
        cache_file = self._namespace_dir(namespace) / f"{qhash}.json"
        with self._lock:
            if cache_file.exists():
                cache_file.unlink()
                return True
        return False

    # ------------------------------------------------------------------
    # Redis-backed fast layer (optional, falls back to file cache)
    # ------------------------------------------------------------------
    async def _try_redis_get(self, query: str, namespace: str = "default") -> Optional[List[Dict]]:
        """Try to get from Redis first (faster than file I/O)."""
        try:
            from intelligen_engine.core.redis import get_redis
            redis = get_redis()
            if redis is None:
                return None
            key = f"evidence_cache:{namespace}:{_query_hash(query, namespace)}"
            data = await redis.get(key)
            if data:
                entries = json.loads(data)
                now = time.time()
                valid = [e for e in entries if e.get("expires_at", 0) >= now]
                if valid:
                    return [e["result"] for e in valid if isinstance(e.get("result"), dict)]
        except Exception:
            pass
        return None

    async def _try_redis_put(self, query: str, entries: list, namespace: str = "default", ttl_seconds: int = 0):
        """Cache to Redis alongside file cache."""
        try:
            from intelligen_engine.core.redis import get_redis
            redis = get_redis()
            if redis is None:
                return
            key = f"evidence_cache:{namespace}:{_query_hash(query, namespace)}"
            await redis.setex(key, ttl_seconds or 86400 * 7, json.dumps(entries, ensure_ascii=False))
        except Exception:
            pass

    def get_with_redis(self, query: str, namespace: str = "default") -> Optional[List[Dict]]:
        """Get with Redis check first, then file fallback."""
        try:
            import asyncio
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop is not None and loop.is_running():
                # Can't await in sync context — skip Redis, use file
                pass
            else:
                loop = asyncio.new_event_loop()
                try:
                    result = loop.run_until_complete(self._try_redis_get(query, namespace))
                    if result:
                        return result
                finally:
                    loop.close()
        except Exception:
            pass
        # Fall back to file cache
        return self.get(query, namespace)

    def put_with_redis(
        self,
        query: str,
        results: List[Dict],
        namespace: str = "default",
    ) -> int:
        """Put to both file cache and Redis."""
        count = self.put(query, results, namespace)
        if count > 0:
            try:
                import asyncio
                qhash = _query_hash(query, namespace)
                ttl_days = _detect_domain_ttl(query, self._default_ttl_days)
                cache_file = self._namespace_dir(namespace) / f"{qhash}.json"
                if cache_file.exists():
                    with open(cache_file, "r", encoding="utf-8") as f:
                        entries = json.load(f)
                    try:
                        loop = asyncio.get_running_loop()
                    except RuntimeError:
                        loop = None
                    if loop is not None and loop.is_running():
                        pass
                    else:
                        loop = asyncio.new_event_loop()
                        try:
                            loop.run_until_complete(
                                self._try_redis_put(query, entries, namespace, ttl_days * 86400)
                            )
                        finally:
                            loop.close()
            except Exception:
                pass
        return count
