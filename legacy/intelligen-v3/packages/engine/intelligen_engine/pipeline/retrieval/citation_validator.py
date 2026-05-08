"""引文验证器 — 生成后检查 [N] 引用标记的正确性。"""

import re
from dataclasses import dataclass, field
from typing import List, Set

from intelligen_engine.pipeline.retrieval.citation_registry import CitationRegistry


# 匹配独立的 [N], 但排除 Markdown 链接 [text](url)
_CITATION_RE = re.compile(r'\[(\d+)\](?!\()')


@dataclass
class ValidationResult:
    """引文标记扫描的验证结果。"""

    valid_refs: List[int] = field(default_factory=list)
    invalid_refs: List[int] = field(default_factory=list)
    uncited_sources: List[int] = field(default_factory=list)
    coverage_ratio: float = 0.0


class CitationValidator:
    """验证并修复生成文本中的引文标记。"""

    # ------------------------------------------------------------------
    # 公共 API
    # ------------------------------------------------------------------
    def validate(self, text: str, registry: CitationRegistry,
                 *, exclude_references_section: bool = True) -> ValidationResult:
        """扫描文本中的 ``[N]`` 标记, 与注册表进行比对。

        Parameters
        ----------
        text:
            完整报告正文 (可能包含参考文献段落)。
        registry:
            权威引文注册表。
        exclude_references_section:
            若为 True, 先剥离尾部参考文献段落, 避免将文献条目本身计为 "已引用"。
        """
        body = self._strip_references_section(text) if exclude_references_section else text

        found: Set[int] = set()
        for m in _CITATION_RE.finditer(body):
            found.add(int(m.group(1)))

        valid = sorted(n for n in found if registry.is_valid(n))
        invalid = sorted(n for n in found if not registry.is_valid(n))

        all_numbers = {e.number for e in registry.get_all()}
        uncited = sorted(all_numbers - found)

        coverage = len(valid) / len(all_numbers) if all_numbers else 1.0

        return ValidationResult(
            valid_refs=valid,
            invalid_refs=invalid,
            uncited_sources=uncited,
            coverage_ratio=round(coverage, 4),
        )

    def fix(self, text: str, registry: CitationRegistry) -> str:
        """移除无效的 ``[N]`` 引用 (N 不在注册表中)。不重新编号。"""
        def _replacer(m: re.Match) -> str:
            num = int(m.group(1))
            if registry.is_valid(num):
                return m.group(0)
            return ""  # 删除无效引用

        return _CITATION_RE.sub(_replacer, text)

    def extract_used_numbers(self, text: str,
                             *, exclude_references_section: bool = True) -> List[int]:
        """返回文本中所有 [N] 引用编号的排序列表。"""
        body = self._strip_references_section(text) if exclude_references_section else text
        return sorted({int(m.group(1)) for m in _CITATION_RE.finditer(body)})

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------
    @staticmethod
    def _strip_references_section(text: str) -> str:
        """移除文本尾部的参考文献段落。"""
        pattern = re.compile(
            r'^#{1,3}\s*[\d.]*\s*(?:参考文献|references|bibliography)\s*$',
            re.IGNORECASE | re.MULTILINE,
        )
        match = None
        for match in pattern.finditer(text):
            pass  # 找到最后一个匹配
        if match:
            return text[:match.start()]
        return text
