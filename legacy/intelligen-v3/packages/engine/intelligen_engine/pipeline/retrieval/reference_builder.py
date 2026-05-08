"""Reference Builder — generates the 参考文献 section from CitationRegistry."""

from typing import List, Optional

from intelligen_engine.pipeline.retrieval.citation_registry import CitationRegistry


class ReferenceBuilder:
    """Builds a references section from CitationRegistry — replaces
    LLM-generated bibliography with verified data."""

    STYLES = {"apa", "mla", "chicago", "gb"}

    def build(self, registry: CitationRegistry,
              used_numbers: Optional[List[int]] = None,
              style: str = "gb") -> str:
        """Generate formatted reference list.

        Parameters
        ----------
        registry:
            The authoritative citation registry.
        used_numbers:
            If provided, only include these citation numbers.
            Otherwise include all registered citations.
        style:
            Citation format style ("apa", "mla", "chicago", "gb").

        Returns
        -------
        Markdown string for the 参考文献 section (without heading).
        """
        entries = registry.get_all()

        if used_numbers is not None:
            wanted = set(used_numbers)
            entries = [e for e in entries if e.number in wanted]

        entries.sort(key=lambda e: e.number)

        if not entries:
            return ""

        formatter = self._get_formatter(style)
        lines: List[str] = []
        for e in entries:
            line = formatter(e)
            lines.append(line)

        return "\n\n".join(lines)

    # ------------------------------------------------------------------
    # Formatting
    # ------------------------------------------------------------------
    def _get_formatter(self, style: str):
        """Return the formatter function for the given style."""
        return {
            "apa": self._format_apa,
            "mla": self._format_mla,
            "chicago": self._format_chicago,
            "gb": self._format_gb,
        }.get(style, self._format_gb)

    @staticmethod
    def _format_entry(e) -> str:
        """Legacy alias — delegates to GB/T 7714 format."""
        return ReferenceBuilder._format_gb(e)

    @staticmethod
    def _format_gb(e) -> str:
        """GB/T 7714 style (Chinese academic standard).
        Format: [N] Authors. Title. Source, Year. URL"""
        parts = [f"[{e.number}]"]

        if e.authors:
            parts.append(f" {e.authors}.")

        parts.append(f" {e.title}.")

        source_year_parts = []
        if e.source:
            source_year_parts.append(e.source)
        if e.year and e.year != "N/A":
            source_year_parts.append(e.year)
        if source_year_parts:
            parts.append(f" {', '.join(source_year_parts)}.")

        if e.url:
            parts.append(f" {e.url}")

        return "".join(parts)

    @staticmethod
    def _format_apa(e) -> str:
        """APA 7th edition style: Authors (Year). Title. Source. URL"""
        parts = []
        if e.authors:
            parts.append(e.authors)
        year = e.year if e.year and e.year != "N/A" else "n.d."
        parts.append(f" ({year}).")
        parts.append(f" {e.title}.")
        if e.source:
            parts.append(f" *{e.source}*.")
        if e.url:
            parts.append(f" {e.url}")
        return "".join(parts)

    @staticmethod
    def _format_mla(e) -> str:
        """MLA 9th edition style: Authors. "Title." Source, Year. URL"""
        parts = []
        if e.authors:
            parts.append(f"{e.authors}.")
        parts.append(f' "{e.title}."')
        if e.source:
            parts.append(f" *{e.source}*,")
        if e.year and e.year != "N/A":
            parts.append(f" {e.year}.")
        if e.url:
            parts.append(f" {e.url}")
        return "".join(parts)

    @staticmethod
    def _format_chicago(e) -> str:
        """Chicago 17th edition style: Authors. "Title." Source (Year). URL"""
        parts = []
        if e.authors:
            parts.append(f"{e.authors}.")
        parts.append(f' "{e.title}."')
        if e.source:
            parts.append(f" {e.source}")
        if e.year and e.year != "N/A":
            parts.append(f" ({e.year}).")
        else:
            parts.append(".")
        if e.url:
            parts.append(f" {e.url}")
        return "".join(parts)
