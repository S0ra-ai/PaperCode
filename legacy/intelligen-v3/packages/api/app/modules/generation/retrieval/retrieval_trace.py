"""
Retrieval Trace — observability for the RAG pipeline.

Records what evidence was retrieved, verified, and used for each section
during report generation. Enables debugging, auditing, and quality analysis.
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
    """Trace of a single evidence item used in retrieval."""
    source: str
    title: str
    score: float = 0.0
    source_tier: str = ""
    verification_status: str = ""
    is_local: bool = False


@dataclass
class SectionTrace:
    """Trace of evidence selection for one section."""
    section_index: int
    section_title: str
    local_evidence: list[EvidenceTrace] = field(default_factory=list)
    web_evidence: list[EvidenceTrace] = field(default_factory=list)
    selected_refs: list[int] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)


@dataclass
class RetrievalTrace:
    """Full retrieval trace for a report generation run."""
    topic: str
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
        """Save trace to JSON file."""
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)
        logger.info(f"📊 Retrieval trace saved to {p}")

    def summary_log(self):
        """Log a human-readable summary."""
        duration = (self.completed_at or time.time()) - self.started_at
        logger.info(
            f"📊 Retrieval trace: topic='{self.topic[:50]}', "
            f"web={self.total_web_results}, local={self.total_local_results}, "
            f"cache_hit={self.cache_hit}, "
            f"sections={len(self.sections)}, "
            f"verification={self.verification_summary}, "
            f"duration={duration:.1f}s"
        )
