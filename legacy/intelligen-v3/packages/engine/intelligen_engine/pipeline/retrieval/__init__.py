"""检索子包 — 证据采集、引文管理与学术文献检索。"""

from intelligen_engine.pipeline.retrieval.evidence import (
    EvidenceItem,
    SourceTier,
    VerificationStatus,
    SOURCE_TIER_MAP,
)
from intelligen_engine.pipeline.retrieval.index_service import IndexService, QueryResult
from intelligen_engine.pipeline.retrieval.evidence_cache import EvidenceCache
from intelligen_engine.pipeline.retrieval.search_verifier import verify_search_results
from intelligen_engine.pipeline.retrieval.retrieval_trace import RetrievalTrace
from intelligen_engine.pipeline.retrieval.hybrid_ranker import HybridRanker, RankingWeights, RankedResult
from intelligen_engine.pipeline.retrieval.exceptions import (
    RAGOperationError,
    IndexBuildError,
    IndexLoadError,
    SearchError,
    SearchTimeoutError,
    VerificationError,
    EvidenceCacheError,
    ContentVerificationError,
    InsufficientEvidenceError,
)

__all__ = [
    "EvidenceItem",
    "SourceTier",
    "VerificationStatus",
    "SOURCE_TIER_MAP",
    "IndexService",
    "QueryResult",
    "EvidenceCache",
    "verify_search_results",
    "RetrievalTrace",
    "HybridRanker",
    "RankingWeights",
    "RankedResult",
    "RAGOperationError",
    "IndexBuildError",
    "IndexLoadError",
    "SearchError",
    "SearchTimeoutError",
    "VerificationError",
    "EvidenceCacheError",
    "ContentVerificationError",
    "InsufficientEvidenceError",
]
