"""
检索追踪 — RAG 管道的可观测性模块。

记录每个章节在报告生成过程中检索到、验证过、使用了哪些证据,
用于调试、审计和质量分析。
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class EvidenceTrace:
    """单条证据的追踪记录。"""
    source: str
    title: str
    score: float = 0.0
    source_tier: str = ""
    verification_status: str = ""
    is_local: bool = False
    selected: bool = True          # 是否被选用
    drop_reason: str = ""          # 未选用原因 (如 "low_score", "suspicious", "expired")
    doi: str = ""
    url: str = ""


@dataclass
class SectionTrace:
    """单个章节的证据选择追踪。"""
    section_index: int
    section_title: str
    local_evidence: list[EvidenceTrace] = field(default_factory=list)
    web_evidence: list[EvidenceTrace] = field(default_factory=list)
    selected_refs: list[int] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)
    queries_used: list[str] = field(default_factory=list)
    dropped_evidence: list[EvidenceTrace] = field(default_factory=list)
    confidence_score: float = 0.0          # 0-1 该章节证据的置信度
    evidence_level: str = "sufficient"     # sufficient | limited | severely_insufficient


@dataclass
class RetrievalTrace:
    """一次报告生成的完整检索追踪。"""
    topic: str
    task_id: str = ""
    started_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    total_web_results: int = 0
    total_local_results: int = 0
    cache_hit: bool = False
    verification_summary: Dict[str, int] = field(default_factory=dict)
    sections: list[SectionTrace] = field(default_factory=list)

    def add_section_trace(self, trace: SectionTrace):
        self.sections.append(trace)

    def finalize(self):
        self.completed_at = time.time()

    def to_dict(self) -> dict:
        return asdict(self)

    def save(self, path: str | Path):
        """将追踪数据保存为 JSON 文件。"""
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)
        logger.info(f"📊 Retrieval trace saved to {p}")

    def summary_log(self):
        """输出可读的追踪摘要日志。"""
        duration = (self.completed_at or time.time()) - self.started_at
        logger.info(
            f"📊 Retrieval trace: topic='{self.topic[:50]}', "
            f"web={self.total_web_results}, local={self.total_local_results}, "
            f"cache_hit={self.cache_hit}, "
            f"sections={len(self.sections)}, "
            f"verification={self.verification_summary}, "
            f"duration={duration:.1f}s"
        )

    # ------------------------------------------------------------------
    # Redis 持久化
    # ------------------------------------------------------------------
    async def store_to_redis(self, task_id: str):
        """将追踪数据存储到 Redis。"""
        try:
            from intelligen_engine.core.redis import get_redis
            redis = get_redis()
            if redis:
                key = f"retrieval_trace:{task_id}"
                await redis.setex(key, 86400 * 7, json.dumps(self.to_dict(), ensure_ascii=False))
        except Exception as e:
            logger.debug(f"Failed to store retrieval trace: {e}")

    @classmethod
    async def load_from_redis(cls, task_id: str) -> Optional["RetrievalTrace"]:
        """从 Redis 加载追踪数据。"""
        try:
            from intelligen_engine.core.redis import get_redis
            redis = get_redis()
            if redis:
                key = f"retrieval_trace:{task_id}"
                data = await redis.get(key)
                if data:
                    d = json.loads(data)
                    trace = cls(topic=d.get("topic", ""))
                    trace.task_id = d.get("task_id", "")
                    trace.started_at = d.get("started_at", 0)
                    trace.completed_at = d.get("completed_at")
                    trace.total_web_results = d.get("total_web_results", 0)
                    trace.total_local_results = d.get("total_local_results", 0)
                    trace.cache_hit = d.get("cache_hit", False)
                    trace.verification_summary = d.get("verification_summary", {})
                    # 从字典重建 SectionTrace 列表
                    valid_fields = set(SectionTrace.__dataclass_fields__)
                    trace.sections = [
                        SectionTrace(**{k: v for k, v in s.items() if k in valid_fields})
                        for s in d.get("sections", [])
                    ]
                    return trace
        except Exception as e:
            logger.debug(f"Failed to load retrieval trace: {e}")
        return None
