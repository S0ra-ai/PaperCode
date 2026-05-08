"""RAG 检索异常体系 — 统一的异常层次结构。"""

from __future__ import annotations


class RAGOperationError(Exception):
    """RAG 操作基础异常。"""


class IndexError(RAGOperationError):
    """文档索引构建或加载失败。"""


class IndexBuildError(IndexError):
    """文档解析、分块或向量化失败。"""


class IndexLoadError(IndexError):
    """无法从磁盘加载持久化索引。"""


class SearchError(RAGOperationError):
    """外部检索源调用失败。"""


class SearchTimeoutError(SearchError):
    """检索请求超时。"""


class VerificationError(RAGOperationError):
    """证据验证（可达性、交叉印证）失败。"""


class EvidenceCacheError(RAGOperationError):
    """证据缓存读写失败。"""


class ContentVerificationError(RAGOperationError):
    """基于 LLM 的内容验证调用失败。"""


class InsufficientEvidenceError(RAGOperationError):
    """已验证证据不足, 无法为章节生成内容。"""

    def __init__(self, section_title: str, coverage: float, threshold: float = 0.3):
        self.section_title = section_title
        self.coverage = coverage
        self.threshold = threshold
        super().__init__(
            f"Insufficient evidence for '{section_title}': "
            f"coverage {coverage:.0%} < threshold {threshold:.0%}"
        )
