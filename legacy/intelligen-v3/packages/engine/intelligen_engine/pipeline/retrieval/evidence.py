"""
证据模型 — 本地与网络检索结果的统一表示。

RAG 管道中流转的每条证据均以 EvidenceItem 表示, 支持:
- 分块级别的来源归属 (非文件级)
- 验证状态追踪
- 来源权威分层
- 检索 → 写作 → 验证 → 标准化全流程统一处理
"""

from __future__ import annotations

import enum
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


class SourceTier(str, enum.Enum):
    """检索源的权威等级。"""
    A = "A"        # Crossref, OpenAlex, Semantic Scholar, 本地上传文档
    B_PLUS = "B+"  # ArXiv (真实论文但未经同行评审)
    B = "B"        # Google Scholar
    C = "C"        # LLM 驱动的搜索 (Perplexity Sonar)


class VerificationStatus(str, enum.Enum):
    """证据的验证状态。"""
    VERIFIED = "verified"           # 多源交叉确认
    LIKELY_VALID = "likely_valid"   # 单一可信源, 无矛盾信息
    UNVERIFIED = "unverified"       # 单源, 未交叉验证
    SUSPICIOUS = "suspicious"       # 仅来自 Tier C, 无印证
    RETRACTED = "retracted"         # DOI 指向已撤稿论文


# 检索源显示名称 → 权威等级映射
SOURCE_TIER_MAP: dict[str, SourceTier] = {
    "Crossref API": SourceTier.A,
    "OpenAlex": SourceTier.A,
    "Semantic Scholar": SourceTier.A,
    "ArXiv": SourceTier.B_PLUS,
    "Google Scholar": SourceTier.B,
    "Perplexity Sonar": SourceTier.C,
    "Local Knowledge Base": SourceTier.A,
}


@dataclass
class EvidenceItem:
    """单条证据 — 本地文档分块或网络检索结果。"""

    id: str                          # 唯一标识 (content_hash + chunk_index 或检索结果哈希)
    source: str                      # 来源系统 (如 "Crossref API", "Local Knowledge Base")
    source_tier: SourceTier          # 权威等级
    title: str                       # 论文标题或源文件名
    content: str                     # 实际文本内容 (分块文本或摘要片段)
    authors: str = ""
    year: str = ""
    url: str = ""
    doi: str = ""

    # 本地文档元数据
    doc_id: Optional[str] = None     # 文档内容哈希
    chunk_id: Optional[str] = None   # 分块级 ID
    chunk_index: Optional[int] = None
    page: Optional[int] = None
    offset: Optional[int] = None
    source_filename: Optional[str] = None

    # 检索元数据
    score: float = 0.0               # 检索相似度 / 相关度分数

    # 验证信息
    verification_status: VerificationStatus = VerificationStatus.UNVERIFIED
    verified_at: Optional[datetime] = None
    corroboration_sources: list[str] = field(default_factory=list)
    liveness_checked: bool = False
    expires_at: Optional[datetime] = None

    def is_expired(self) -> bool:
        """判断该证据是否已过期。"""
        if self.expires_at is None:
            return False
        return self.expires_at < datetime.now()

    @property
    def is_local(self) -> bool:
        return self.doc_id is not None

    @property
    def is_trustworthy(self) -> bool:
        """判断该证据是否可信, 可用于内容生成。"""
        return self.verification_status in (
            VerificationStatus.VERIFIED,
            VerificationStatus.LIKELY_VALID,
        )

    def to_registry_dict(self) -> dict:
        """转换为 CitationRegistry.register() 所需的字典格式。"""
        return {
            "title": self.title,
            "authors": self.authors,
            "year": self.year,
            "link": self.url,
            "source": self.source,
            "snippet": self.content[:200] if self.content else "",
        }
