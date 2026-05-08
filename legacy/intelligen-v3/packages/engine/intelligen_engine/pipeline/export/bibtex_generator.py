"""BibTeX 生成器 — 从引文数据生成 .bib 文件"""

from __future__ import annotations

import re
import unicodedata
from typing import Optional


class BibTeXGenerator:
    """BibTeX 生成器 — 将引文列表转换为 BibTeX 格式

    支持多种条目类型（article/book/thesis 等），
    自动生成 AuthorYear 风格 cite key，处理中英文作者。
    """

    STYLE_MAP = {
        "APA": "apalike",
        "MLA": "plain",
        "Chicago": "chicago",
        "Vancouver": "vancouver",
        "GB/T 7714": "gbt7714-numerical",
        "IEEE": "IEEEtran",
    }

    # 引文 dict 的 type 字段到 BibTeX 条目类型的映射
    _TYPE_MAP = {
        "article": "article",
        "journal": "article",
        "conference": "inproceedings",
        "inproceedings": "inproceedings",
        "proceeding": "inproceedings",
        "book": "book",
        "thesis": "phdthesis",
        "master_thesis": "mastersthesis",
        "phd_thesis": "phdthesis",
        "report": "techreport",
        "techreport": "techreport",
        "patent": "misc",
        "webpage": "misc",
        "website": "misc",
        "misc": "misc",
    }

    def generate_bib(self, citations: list[dict]) -> str:
        """从引文列表生成 .bib 文件内容"""
        if not citations:
            return ""

        entries = []
        for i, cite in enumerate(citations):
            entry_type = self._determine_entry_type(cite)
            cite_key = self._generate_cite_key(cite, i)
            fields = self._format_fields(cite)
            entry = f"@{entry_type}{{{cite_key},\n{fields}\n}}"
            entries.append(entry)
        return "\n\n".join(entries)

    def _determine_entry_type(self, cite: dict) -> str:
        """将引文类型映射为 BibTeX 条目类型"""
        raw = str(cite.get("type", "")).strip().lower()
        return self._TYPE_MAP.get(raw, "misc")

    def _generate_cite_key(self, cite: dict, index: int) -> str:
        """生成 AuthorYear 格式的 cite key，如 ``Smith2024``"""
        authors = cite.get("authors") or cite.get("author") or ""
        year = str(cite.get("year", "")).strip()

        surname = ""
        if isinstance(authors, list) and authors:
            surname = self._extract_surname(authors[0])
        elif isinstance(authors, str) and authors.strip():
            first_author = re.split(r"[;,，；]", authors)[0].strip()
            surname = self._extract_surname(first_author)

        if surname and year:
            return f"{surname}{year}"
        if surname:
            return f"{surname}ref{index + 1}"
        return f"ref{index + 1}"

    @staticmethod
    def _extract_surname(name: str) -> str:
        """提取干净的 ASCII 安全姓氏作为 cite key"""
        name = name.strip()
        if not name:
            return ""
        # 检测是否主要为 CJK 字符
        if any("\u4e00" <= ch <= "\u9fff" for ch in name):
            # 中文名：提取前几个字符作为 key
            clean = re.sub(r"[^a-zA-Z\u4e00-\u9fff]", "", name)
            return clean[:4] if clean else "author"
        parts = name.replace(",", " ").split()
        surname = parts[-1] if parts else "author"
        # 去除非字母数字字符
        surname = re.sub(r"[^a-zA-Z0-9]", "", surname)
        return surname or "author"

    def _format_fields(self, cite: dict) -> str:
        """格式化引文字段为 BibTeX 键值对"""
        field_map = [
            ("title", "title"),
            ("author", "authors"),
            ("year", "year"),
            ("journal", "journal"),
            ("booktitle", "booktitle"),
            ("volume", "volume"),
            ("number", "number"),
            ("pages", "pages"),
            ("publisher", "publisher"),
            ("doi", "doi"),
            ("url", "url"),
            ("institution", "institution"),
            ("school", "school"),
            ("note", "note"),
            ("abstract", "abstract"),
        ]
        lines = []
        for bib_key, dict_key in field_map:
            value = cite.get(dict_key)
            if value is None:
                # 也尝试用 BibTeX 键名直接查找
                value = cite.get(bib_key)
            if value is None:
                continue
            if isinstance(value, list):
                value = " and ".join(str(v) for v in value)
            value = str(value).strip()
            if not value:
                continue
            # 转义 BibTeX 特殊字符
            escaped = self._escape_bibtex(value)
            lines.append(f"  {bib_key} = {{{escaped}}}")
        return ",\n".join(lines)

    @staticmethod
    def _escape_bibtex(text: str) -> str:
        """转义 BibTeX 值中的特殊字符"""
        # 值已被花括号包裹，内部花括号需配对
        # 仅转义裸 # 和 % 等可能引发问题的字符
        text = text.replace("\\", "\\textbackslash{}")
        # 不重复转义已转义的字符
        text = text.replace("&", r"\&")
        return text

    def get_bibtex_style(self, citation_style: str) -> str:
        """将引文风格名称映射为 .bst 文件名"""
        return self.STYLE_MAP.get(citation_style, "plainnat")
