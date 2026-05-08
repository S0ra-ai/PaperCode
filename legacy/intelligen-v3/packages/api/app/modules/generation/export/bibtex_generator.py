"""从结构化引用数据生成 BibTeX。"""

from __future__ import annotations

import re


class BibTeXGenerator:
    """从引用数据生成 BibTeX 条目。"""

    STYLE_MAP = {
        "APA": "apalike",
        "MLA": "plain",
        "Chicago": "chicago",
        "Vancouver": "vancouver",
        "GB/T 7714": "gbt7714-numerical",
        "IEEE": "IEEEtran",
    }

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
        raw = str(cite.get("type", "")).strip().lower()
        return self._TYPE_MAP.get(raw, "misc")

    def _generate_cite_key(self, cite: dict, index: int) -> str:
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
        name = name.strip()
        if not name:
            return ""
        if any("\u4e00" <= ch <= "\u9fff" for ch in name):
            clean = re.sub(r"[^a-zA-Z\u4e00-\u9fff]", "", name)
            return clean[:4] if clean else "author"
        parts = name.replace(",", " ").split()
        surname = parts[-1] if parts else "author"
        surname = re.sub(r"[^a-zA-Z0-9]", "", surname)
        return surname or "author"

    def _format_fields(self, cite: dict) -> str:
        field_map = [
            ("title", "title"), ("author", "authors"), ("year", "year"),
            ("journal", "journal"), ("booktitle", "booktitle"),
            ("volume", "volume"), ("number", "number"), ("pages", "pages"),
            ("publisher", "publisher"), ("doi", "doi"), ("url", "url"),
            ("institution", "institution"), ("school", "school"),
            ("note", "note"), ("abstract", "abstract"),
        ]
        lines = []
        for bib_key, dict_key in field_map:
            value = cite.get(dict_key)
            if value is None:
                value = cite.get(bib_key)
            if value is None:
                continue
            if isinstance(value, list):
                value = " and ".join(str(v) for v in value)
            value = str(value).strip()
            if not value:
                continue
            escaped = self._escape_bibtex(value)
            lines.append(f"  {bib_key} = {{{escaped}}}")
        return ",\n".join(lines)

    @staticmethod
    def _escape_bibtex(text: str) -> str:
        text = text.replace("\\", "\\textbackslash{}")
        text = text.replace("&", r"\&")
        return text

    def get_bibtex_style(self, citation_style: str) -> str:
        return self.STYLE_MAP.get(citation_style, "plainnat")
