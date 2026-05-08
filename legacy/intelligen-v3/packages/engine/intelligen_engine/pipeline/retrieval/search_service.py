"""
Unified Academic Search — aggregates Crossref, OpenAlex, ArXiv, S2, Perplexity Sonar, Google.
Migrated from model_strategy/app/services/search_service.py
"""
import copy
import hashlib
import json
import logging
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse

import requests
from urllib3.exceptions import InsecureRequestWarning

from intelligen_engine.core.config import settings

requests.packages.urllib3.disable_warnings(InsecureRequestWarning)


class SearchCache:
    """TTL cache with optional JSON disk persistence."""

    def __init__(self, ttl_seconds: int = 86400, cache_dir: Optional[str] = None):
        self._cache: Dict[str, Tuple[float, List[Dict]]] = {}
        self._ttl = max(int(ttl_seconds), 0)
        self._lock = RLock()
        self._cache_dir: Optional[Path] = None

        if cache_dir:
            try:
                cache_path = Path(cache_dir)
                cache_path.mkdir(parents=True, exist_ok=True)
                self._cache_dir = cache_path
            except OSError as exc:
                logging.warning(f"SearchCache disk backend unavailable ({cache_dir}): {exc}")

    def _copy_results(self, results: List[Dict]) -> List[Dict]:
        return copy.deepcopy(results)

    def _is_enabled(self) -> bool:
        return self._ttl > 0

    def _is_expired(self, ts: float) -> bool:
        return self._ttl <= 0 or (time.time() - ts) >= self._ttl

    def _make_key(
        self,
        queries: Dict[str, str],
        limit: int,
        extra: Optional[Dict] = None,
    ) -> str:
        payload = {
            "queries": queries,
            "limit": limit,
            "extra": extra or {},
        }
        raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def _cache_path(self, key: str) -> Optional[Path]:
        if self._cache_dir is None:
            return None
        return self._cache_dir / f"{key}.json"

    def _read_disk_entry(self, key: str) -> Optional[Tuple[float, List[Dict]]]:
        path = self._cache_path(key)
        if path is None or not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as fh:
                payload = json.load(fh)
            ts = float(payload["ts"])
            results = payload["results"]
            if not isinstance(results, list):
                raise ValueError("cache payload results is not a list")
            return ts, results
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            logging.warning(f"SearchCache invalid disk entry {path}: {exc}")
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass
            return None

    def _write_disk_entry(self, key: str, ts: float, results: List[Dict]) -> None:
        path = self._cache_path(key)
        if path is None:
            return

        payload = {"ts": ts, "results": self._copy_results(results)}
        tmp_path = path.with_suffix(".json.tmp")
        try:
            with tmp_path.open("w", encoding="utf-8") as fh:
                json.dump(payload, fh, ensure_ascii=False)
            os.replace(tmp_path, path)
        except OSError as exc:
            logging.warning(f"SearchCache failed to persist {path}: {exc}")
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass

    def get(
        self,
        queries: Dict[str, str],
        limit: int,
        extra: Optional[Dict] = None,
    ) -> Optional[List[Dict]]:
        if not self._is_enabled():
            return None

        key = self._make_key(queries, limit, extra=extra)
        with self._lock:
            entry = self._cache.get(key)
            if entry is not None:
                ts, results = entry
                if not self._is_expired(ts):
                    logging.info(f"SearchCache HIT (memory, key={key[:8]}…)")
                    return self._copy_results(results)
                self._cache.pop(key, None)

            disk_entry = self._read_disk_entry(key)
            if disk_entry is None:
                return None

            ts, results = disk_entry
            if self._is_expired(ts):
                path = self._cache_path(key)
                if path is not None:
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        pass
                return None

            self._cache[key] = (ts, self._copy_results(results))
            logging.info(f"SearchCache HIT (disk, key={key[:8]}…)")
            return self._copy_results(results)

    def put(
        self,
        queries: Dict[str, str],
        limit: int,
        results: List[Dict],
        extra: Optional[Dict] = None,
    ) -> None:
        if not self._is_enabled():
            return

        key = self._make_key(queries, limit, extra=extra)
        ts = time.time()
        copied = self._copy_results(results)

        with self._lock:
            self._cache[key] = (ts, copied)
            self._write_disk_entry(key, ts, copied)

    def clear_expired(self) -> None:
        if not self._is_enabled():
            self._cache.clear()
            return

        now = time.time()
        with self._lock:
            expired_keys = [
                key for key, (ts, _) in self._cache.items()
                if (now - ts) >= self._ttl
            ]
            for key in expired_keys:
                self._cache.pop(key, None)

            if self._cache_dir is None:
                return

            for path in self._cache_dir.glob("*.json"):
                try:
                    with path.open("r", encoding="utf-8") as fh:
                        payload = json.load(fh)
                    ts = float(payload["ts"])
                    if (now - ts) >= self._ttl:
                        path.unlink(missing_ok=True)
                except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        pass


@dataclass(frozen=True)
class _ScoredSearchResult:
    result: Dict[str, str]
    score: float
    source_weight: float
    source_rank: int
    lexical_overlap: float


class UnifiedAcademicSearcher:
    """Aggregates Crossref, OpenAlex, ArXiv, Semantic Scholar, Perplexity Sonar, Google."""

    _SOURCE_ORDER = (
        "Crossref API",
        "OpenAlex",
        "Semantic Scholar",
        "ArXiv",
        "Perplexity Sonar",
        "Google Scholar",
    )
    _GENERIC_SNIPPETS = {
        "",
        "no abstract available.",
        "published in n/a. doi: none",
    }
    _TOKEN_STOP_WORDS = {
        "the", "and", "for", "with", "from", "into", "using", "based",
        "study", "review", "survey", "analysis", "recent", "approach",
        "approaches", "method", "methods", "paper", "research",
    }
    _AUTHOR_STOP_WORDS = {"and", "et", "al"}

    def __init__(
        self,
        *,
        cache: Optional[SearchCache] = None,
        source_weights: Optional[Dict[str, float]] = None,
    ):
        self.serp_key = settings.SERPAPI_KEY
        self.email = settings.ACADEMIC_EMAIL or "test@example.com"
        self.openrouter_api_key = settings.OPENROUTER_API_KEY
        self.search_model = settings.SEARCH_MODEL_NAME
        self._source_weights = self._build_source_weights(source_weights)
        self._cache = cache or self._build_cache()
        self._cache_context = {
            "fusion_version": "weighted_rrf_v2",
            "weights": self._source_weights,
        }
        self.headers = {
            "User-Agent": f"AcademicReportBot/3.0 (mailto:{self.email})"
        }

    def _build_cache(self) -> SearchCache:
        backend = (settings.SEARCH_CACHE_BACKEND or "memory").strip().lower()
        cache_dir = settings.SEARCH_CACHE_DIR if backend == "disk" else None
        if backend not in {"memory", "disk"}:
            logging.warning(f"Unknown SEARCH_CACHE_BACKEND={backend}, falling back to memory")
            cache_dir = None
        return SearchCache(
            ttl_seconds=settings.SEARCH_CACHE_TTL_SECONDS,
            cache_dir=cache_dir,
        )

    def _build_source_weights(self, overrides: Optional[Dict[str, float]] = None) -> Dict[str, float]:
        weights = dict(settings.search_source_weights)
        for source_name, value in (overrides or {}).items():
            try:
                weights[source_name] = max(float(value), 0.0)
            except (TypeError, ValueError):
                continue
        return weights

    @classmethod
    def _normalize_title_key(cls, title: str) -> str:
        return re.sub(r"[\W_]+", "", (title or "").lower())

    @staticmethod
    def _normalize_url_key(url: str) -> str:
        normalized = (url or "").strip().lower()
        normalized = re.sub(r"^https?://", "", normalized)
        return normalized.rstrip("/")

    @staticmethod
    def _extract_doi(text: str) -> str:
        match = re.search(r"(10\.\d{4,9}/[-._;()/:A-Z0-9]+)", text or "", flags=re.I)
        if not match:
            return ""
        return match.group(1).lower().rstrip(" .;,)")

    @classmethod
    def _text_tokens(cls, text: str) -> Set[str]:
        tokens = re.findall(r"[a-z0-9]{2,}|[\u4e00-\u9fff]{2,}", (text or "").lower())
        return {
            token for token in tokens
            if token not in cls._TOKEN_STOP_WORDS
        }

    @classmethod
    def _author_tokens(cls, authors: str) -> Set[str]:
        tokens = re.findall(r"[a-z]{2,}", (authors or "").lower())
        return {
            token for token in tokens
            if token not in cls._AUTHOR_STOP_WORDS
        }

    @staticmethod
    def _parse_year(year: str) -> Optional[int]:
        match = re.search(r"(19|20)\d{2}", str(year or ""))
        return int(match.group(0)) if match else None

    def _years_compatible(self, left_year: str, right_year: str) -> bool:
        left = self._parse_year(left_year)
        right = self._parse_year(right_year)
        if left is None or right is None:
            return True
        return abs(left - right) <= 1

    def _source_priority(self, source: str) -> int:
        try:
            return self._SOURCE_ORDER.index(source)
        except ValueError:
            return len(self._SOURCE_ORDER)

    def _result_completeness(self, result: Dict[str, str]) -> float:
        score = 0.0
        if result.get("title"):
            score += 1.0
        if result.get("authors"):
            score += 1.0
        if self._parse_year(result.get("year", "")) is not None:
            score += 1.0
        if result.get("link"):
            score += 1.0
        snippet = (result.get("snippet") or "").strip().lower()
        if snippet and snippet not in self._GENERIC_SNIPPETS:
            score += 1.0
        return score / 5.0

    def _lexical_overlap(self, query_terms: Set[str], result: Dict[str, str]) -> float:
        if not query_terms:
            return 0.0
        result_terms = self._text_tokens(result.get("title", ""))
        result_terms |= self._text_tokens(result.get("snippet", ""))
        if not result_terms:
            return 0.0
        return len(query_terms & result_terms) / max(len(query_terms), 1)

    def _score_result(
        self,
        result: Dict[str, str],
        *,
        source_rank: int,
        query_terms: Set[str],
    ) -> _ScoredSearchResult:
        source = result.get("source", "")
        source_weight = self._source_weights.get(source, 0.6)
        overlap = self._lexical_overlap(query_terms, result)
        completeness = self._result_completeness(result)
        rank_component = source_weight / (source_rank + 1)
        score = round(rank_component + (0.18 * overlap) + (0.04 * completeness), 8)
        return _ScoredSearchResult(
            result=result,
            score=score,
            source_weight=source_weight,
            source_rank=source_rank,
            lexical_overlap=overlap,
        )

    def _canonical_candidate_key(self, candidate: _ScoredSearchResult) -> Tuple:
        return (
            round(candidate.source_weight, 8),
            round(candidate.lexical_overlap, 8),
            round(self._result_completeness(candidate.result), 8),
            -candidate.source_rank,
            len(candidate.result.get("snippet", "")),
            -self._source_priority(candidate.result.get("source", "")),
            self._normalize_title_key(candidate.result.get("title", "")),
            self._normalize_url_key(candidate.result.get("link", "")),
        )

    def _sanitize_result(self, raw_result: Dict, fallback_source: str) -> Dict[str, str]:
        return self._normalize_result(
            title=raw_result.get("title", ""),
            authors=raw_result.get("authors", ""),
            year=raw_result.get("year", "N/A"),
            snippet=raw_result.get("snippet", ""),
            url=raw_result.get("link", ""),
            source=raw_result.get("source") or fallback_source,
        )

    def _are_near_duplicates(self, left: Dict[str, str], right: Dict[str, str]) -> bool:
        left_doi = self._extract_doi(left.get("link", ""))
        right_doi = self._extract_doi(right.get("link", ""))
        if left_doi and left_doi == right_doi:
            return True

        left_url = self._normalize_url_key(left.get("link", ""))
        right_url = self._normalize_url_key(right.get("link", ""))
        if left_url and left_url == right_url:
            return True

        left_title = self._normalize_title_key(left.get("title", ""))
        right_title = self._normalize_title_key(right.get("title", ""))
        if left_title and left_title == right_title:
            return True

        left_tokens = self._text_tokens(left.get("title", ""))
        right_tokens = self._text_tokens(right.get("title", ""))
        union = left_tokens | right_tokens
        if len(union) < 3:
            return False

        jaccard = len(left_tokens & right_tokens) / len(union)
        if jaccard >= 0.9:
            return True
        if jaccard < 0.75 or not self._years_compatible(left.get("year", ""), right.get("year", "")):
            return False

        left_authors = self._author_tokens(left.get("authors", ""))
        right_authors = self._author_tokens(right.get("authors", ""))
        if not left_authors or not right_authors:
            return True
        return bool(left_authors & right_authors)

    def _merge_group(self, candidates: List[_ScoredSearchResult]) -> Dict[str, str]:
        ordered = sorted(candidates, key=self._canonical_candidate_key, reverse=True)
        canonical = dict(ordered[0].result)

        if not canonical.get("authors"):
            canonical["authors"] = next(
                (item.result.get("authors", "") for item in ordered if item.result.get("authors")),
                "",
            )

        if not self._parse_year(canonical.get("year", "")):
            canonical["year"] = next(
                (item.result.get("year", "N/A") for item in ordered if self._parse_year(item.result.get("year", ""))),
                canonical.get("year", "N/A"),
            )

        if not canonical.get("link"):
            canonical["link"] = next(
                (item.result.get("link", "") for item in ordered if item.result.get("link")),
                "",
            )

        best_snippet = next(
            (
                item.result.get("snippet", "")
                for item in sorted(
                    ordered,
                    key=lambda item: (
                        len(item.result.get("snippet", "")),
                        round(item.lexical_overlap, 8),
                        round(item.source_weight, 8),
                    ),
                    reverse=True,
                )
                if item.result.get("snippet", "").strip().lower() not in self._GENERIC_SNIPPETS
            ),
            canonical.get("snippet", ""),
        )
        canonical["snippet"] = best_snippet
        return canonical

    def _fuse_results(self, results_by_source: Dict[str, List[Dict]], queries: Dict[str, str]) -> List[Dict]:
        query_terms: Set[str] = set()
        for value in (queries or {}).values():
            query_terms.update(self._text_tokens(str(value)))

        groups: List[Dict] = []
        raw_count = 0

        for source_name in self._SOURCE_ORDER:
            source_results = results_by_source.get(source_name, [])
            for rank, raw_result in enumerate(source_results, start=1):
                if not isinstance(raw_result, dict):
                    continue

                candidate_result = self._sanitize_result(raw_result, source_name)
                if not candidate_result.get("title") and not candidate_result.get("link"):
                    continue

                raw_count += 1
                candidate = self._score_result(
                    candidate_result,
                    source_rank=rank,
                    query_terms=query_terms,
                )

                matched_group = None
                for group in groups:
                    if any(self._are_near_duplicates(candidate.result, member.result) for member in group["members"]):
                        matched_group = group
                        break

                if matched_group is None:
                    groups.append({"members": [candidate], "score": candidate.score})
                else:
                    matched_group["members"].append(candidate)
                    matched_group["score"] += candidate.score

        fused_groups = []
        for group in groups:
            merged_result = self._merge_group(group["members"])
            best_candidate = max(group["members"], key=self._canonical_candidate_key)
            fused_groups.append({
                "result": merged_result,
                "score": round(group["score"], 8),
                "best_weight": best_candidate.source_weight,
                "best_rank": best_candidate.source_rank,
                "source_count": len({item.result.get("source", "") for item in group["members"]}),
            })

        fused_groups.sort(key=lambda item: (
            -item["score"],
            -item["source_count"],
            -item["best_weight"],
            item["best_rank"],
            self._source_priority(item["result"].get("source", "")),
            self._normalize_title_key(item["result"].get("title", "")),
            self._normalize_url_key(item["result"].get("link", "")),
        ))

        fused_results = []
        for item in fused_groups:
            result = item["result"]
            result["_source_count"] = item["source_count"]
            fused_results.append(result)
        logging.info(f"📊 检索完成。原始: {raw_count} -> 融合去重: {len(fused_results)}")
        return fused_results

    def _normalize_result(self, title, authors, year, snippet, url, source):
        return {
            "title": str(title).strip(),
            "authors": str(authors).strip(),
            "year": str(year),
            "snippet": str(snippet).strip().replace("\n", " ")[:600],
            "link": str(url).strip(),
            "source": str(source).strip(),
        }

    def _search_with_retry(self, source_name: str, search_fn, *args, max_retries=3, **kwargs) -> List[Dict]:
        for attempt in range(max_retries):
            try:
                logging.info(f"🔍 [{source_name}] 搜索 (尝试 {attempt+1}/{max_retries})")
                result = search_fn(*args, **kwargs)
                return result if result is not None else []
            except Exception as e:
                logging.warning(f"⚠️ [{source_name}] 尝试 {attempt+1}/{max_retries} 失败: {e}")
                if attempt < max_retries - 1:
                    wait_time = min(2 ** (attempt + 1), 10)
                    time.sleep(wait_time)
        return []

    def _http_get(self, url: str, params: dict = None, timeout: int = 15, headers: dict = None) -> dict:
        resp = requests.get(url, params=params, headers=headers or self.headers, timeout=timeout, verify=False)
        resp.raise_for_status()
        return resp.json()

    # --- Crossref ---
    def search_crossref(self, query: str, limit=6) -> List[Dict]:
        return self._search_with_retry("Crossref", self._search_crossref_impl, query, limit)

    def _search_crossref_impl(self, query: str, limit: int) -> List[Dict]:
        params = {
            "query.bibliographic": query, "rows": limit, "sort": "relevance",
            "select": "title,author,published,abstract,URL,container-title,DOI"
        }
        data = self._http_get("https://api.crossref.org/works", params=params, timeout=15)
        items = data.get("message", {}).get("items", [])
        results = []
        for item in items:
            title = item.get("title", ["Unknown Title"])[0]
            authors_list = [
                f"{a.get('given', '')} {a.get('family', '')}".strip()
                for a in item.get("author", [])[:3]
            ]
            authors = ", ".join(a for a in authors_list if a)
            try:
                year = item.get("published", {}).get("date-parts", [[None]])[0][0]
            except (IndexError, TypeError):
                year = "N/A"
            abstract = item.get("abstract", "")
            if abstract:
                abstract = re.sub(r"<[^>]+>", "", abstract)
            else:
                journal = item.get("container-title", [""])[0]
                abstract = f"Published in {journal}. DOI: {item.get('DOI')}"
            results.append(self._normalize_result(
                title=title, authors=authors, year=year, snippet=abstract,
                url=item.get("URL") or f"https://doi.org/{item.get('DOI')}", source="Crossref API"
            ))
        logging.info(f"   ✅ [Crossref] 找到 {len(results)} 篇")
        return results

    # --- OpenAlex ---
    def search_openalex(self, query: str, limit=6) -> List[Dict]:
        return self._search_with_retry("OpenAlex", self._search_openalex_impl, query, limit)

    def _search_openalex_impl(self, query: str, limit: int) -> List[Dict]:
        params = {
            "search": query, "sort": "relevance_score:desc", "per_page": limit,
            "filter": f"from_publication_date:{datetime.now().year-5}-01-01"
        }
        data = self._http_get("https://api.openalex.org/works", params=params, timeout=10)
        if not isinstance(data, dict):
            return []
        results = []
        for item in data.get("results", []):
            authors = ", ".join([
                a.get("author", {}).get("display_name", "Unknown")
                for a in item.get("authorships", []) if a
            ][:3])
            concepts = ", ".join([
                c.get("display_name", "")
                for c in item.get("concepts", []) if c
            ][:5])
            journal = (item.get("primary_location") or {}).get("source", {}).get("display_name", "N/A")
            snippet = f"Key Concepts: {concepts}. Journal: {journal}"
            results.append(self._normalize_result(
                title=item.get("title", "Unknown Title"), authors=authors,
                year=item.get("publication_year", "N/A"), snippet=snippet,
                url=item.get("doi") or item.get("id", ""), source="OpenAlex"
            ))
        logging.info(f"   ✅ [OpenAlex] 找到 {len(results)} 篇")
        return results

    # --- ArXiv ---
    def search_arxiv(self, query: str, limit=5, translated_query: str = None) -> List[Dict]:
        return self._search_with_retry("ArXiv", self._search_arxiv_impl, query, limit, translated_query=translated_query)

    def _search_arxiv_impl(self, query: str, limit: int, translated_query: str = None) -> List[Dict]:
        search_query = query
        if any(ord(c) > 127 for c in query):
            if translated_query:
                search_query = translated_query
            else:
                ascii_words = re.findall(r"[a-zA-Z]{3,}", query)
                if ascii_words:
                    search_query = " ".join(ascii_words)
                else:
                    logging.info("   ⚠️ [ArXiv] Skipping: no translatable keywords")
                    return []
        import arxiv as arxiv_lib
        client = arxiv_lib.Client()
        search = arxiv_lib.Search(query=search_query, max_results=limit, sort_by=arxiv_lib.SortCriterion.Relevance)
        results = []
        for paper in client.results(search):
            authors = ", ".join(a.name for a in paper.authors[:3])
            year = paper.published.year if paper.published else "Recent"
            snippet = (paper.summary or "")[:1000]
            results.append(self._normalize_result(
                title=paper.title or "Unknown",
                authors=authors or "ArXiv Author",
                year=str(year),
                snippet=snippet,
                url=paper.entry_id or "", source="ArXiv"
            ))
        logging.info(f"   ✅ [ArXiv] 找到 {len(results)} 篇")
        return results

    # --- Semantic Scholar ---
    def search_semantic_scholar_public(self, query: str, limit=5) -> List[Dict]:
        return self._search_with_retry("S2", self._search_semantic_scholar_impl, query, limit)

    def _search_semantic_scholar_impl(self, query: str, limit: int) -> List[Dict]:
        time.sleep(1.0)
        url = "https://api.semanticscholar.org/graph/v1/paper/search"
        params = {
            "query": query, "limit": limit,
            "year": f"{datetime.now().year-5}-{datetime.now().year}",
            "fields": "title,abstract,year,authors,url,venue"
        }
        data = self._http_get(url, params=params, timeout=10, headers={})
        results = []
        for paper in data.get("data", []):
            authors = ", ".join([a["name"] for a in paper.get("authors", [])[:3]])
            results.append(self._normalize_result(
                title=paper.get("title"), authors=authors,
                year=paper.get("year"),
                snippet=paper.get("abstract") or "No abstract available.",
                url=paper.get("url"), source="Semantic Scholar"
            ))
        logging.info(f"   ✅ [S2] 找到 {len(results)} 篇")
        return results

    # --- Google Scholar (SerpAPI) ---
    def search_google_serp(self, query: str, limit=4) -> List[Dict]:
        if not self.serp_key:
            return []
        return self._search_with_retry("Google", self._search_google_serp_impl, query, limit)

    def _search_google_serp_impl(self, query: str, limit: int) -> List[Dict]:
        params = {
            "q": query, "api_key": self.serp_key, "engine": "google_scholar",
            "num": limit, "hl": "zh-CN", "as_ylo": datetime.now().year - 4
        }
        data = self._http_get("https://serpapi.com/search", params=params, timeout=20)
        results = []
        for item in data.get("organic_results", []):
            results.append(self._normalize_result(
                title=item.get("title"), authors="Google Scholar Result",
                year="Recent", snippet=item.get("snippet", ""),
                url=item.get("link"), source="Google Scholar"
            ))
        logging.info(f"   ✅ [Google] 找到 {len(results)} 篇")
        return results

    # --- Perplexity Sonar ---
    def search_perplexity_sonar(self, query: str, limit=6) -> List[Dict]:
        if not self.openrouter_api_key:
            logging.warning("⚠️ [Sonar] 未配置 OPENROUTER_API_KEY，跳过实时搜索")
            return []
        return self._search_with_retry("Sonar", self._search_perplexity_sonar_impl, query, limit)

    def _search_perplexity_sonar_impl(self, query: str, limit: int) -> List[Dict]:
        base_url = settings.OPENROUTER_BASE_URL.rstrip("/")
        resp = requests.post(
            f"{base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": self.search_model,
                "messages": [
                    {"role": "system", "content": "You are an academic research assistant. Provide a concise research summary with key findings."},
                    {"role": "user", "content": f"Summarize recent academic research about: {query}"}
                ],
                "temperature": 0.1,
                "max_tokens": 2048,
            },
            timeout=60,
            verify=False
        )
        resp.raise_for_status()
        data = resp.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        citations = data.get("citations", [])

        results = []
        for i, url in enumerate(citations[:limit]):
            domain = urlparse(url).netloc.replace("www.", "")
            title = f"Research source from {domain}" if domain else f"Sonar Source {i+1}"
            snippet = content[:400] if i == 0 and content else ""
            results.append(self._normalize_result(
                title=title, authors="Perplexity Sonar",
                year="Recent", snippet=snippet,
                url=url, source="Perplexity Sonar"
            ))

        logging.info(f"   ✅ [Sonar] 找到 {len(results)} 条真实引用")
        return results

    @staticmethod
    def _deduplicate_results(results: list[dict]) -> list[dict]:
        """Remove duplicate search results by DOI or normalized title."""
        seen = set()
        unique = []
        for r in results:
            # Key by DOI if available, else by normalized title
            doi = (r.get("doi") or "").strip().lower()
            title = (r.get("title") or "").strip().lower()
            # Remove punctuation and extra whitespace for title comparison
            norm_title = re.sub(r'[^\w\s]', '', title)
            norm_title = re.sub(r'\s+', ' ', norm_title).strip()

            key = doi if doi else norm_title
            if not key or key in seen:
                continue
            seen.add(key)
            unique.append(r)
        return unique

    # --- Ensemble ---
    def run_ensemble_search(self, topic_query: Dict[str, str], limit=10) -> List[Dict]:
        """Run all search sources concurrently, then fuse and cache deterministically."""
        self._cache.clear_expired()
        cached = self._cache.get(topic_query, limit, extra=self._cache_context)
        if cached is not None:
            return cached

        precise_query = topic_query.get("precise") or topic_query.get("general") or ""
        general_query = topic_query.get("general") or precise_query
        arxiv_query = topic_query.get("arxiv") or precise_query

        tasks = [
            ("Crossref API", self.search_crossref, precise_query, limit),
            ("OpenAlex", self.search_openalex, precise_query, limit),
            ("Semantic Scholar", self.search_semantic_scholar_public, precise_query, limit),
            ("ArXiv", self.search_arxiv, arxiv_query, limit),
            ("Perplexity Sonar", self.search_perplexity_sonar, general_query, limit),
            ("Google Scholar", self.search_google_serp, general_query, limit),
        ]

        results_by_source = {source_name: [] for source_name, _, _, _ in tasks}
        logging.info("🚀 开始全网并发检索...")
        with ThreadPoolExecutor(max_workers=4) as executor:
            future_to_source = {
                executor.submit(func, query, source_limit): source_name
                for source_name, func, query, source_limit in tasks
                if query
            }
            for future in as_completed(future_to_source):
                source_name = future_to_source[future]
                try:
                    results = future.result()
                    if isinstance(results, list):
                        results_by_source[source_name] = results
                except Exception as e:
                    logging.error(f"源 {source_name} 执行失败: {e}")

        fused_results = self._fuse_results(results_by_source, topic_query)
        fused_results = self._deduplicate_results(fused_results)
        self._cache.put(topic_query, limit, fused_results, extra=self._cache_context)
        return fused_results
