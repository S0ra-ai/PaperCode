"""Citation Validator — post-generation check for [N] references."""

import re
from dataclasses import dataclass, field
from typing import List, Set

from app.modules.generation.retrieval.citation_registry import CitationRegistry


# Matches standalone [N] but NOT markdown links [text](url).
# Negative lookahead ensures we don't match the `[N]` inside `[N](...)`.
_CITATION_RE = re.compile(r'\[(\d+)\](?!\()')


@dataclass
class ValidationResult:
    """Outcome of scanning text for citation markers."""

    valid_refs: List[int] = field(default_factory=list)
    invalid_refs: List[int] = field(default_factory=list)
    uncited_sources: List[int] = field(default_factory=list)
    coverage_ratio: float = 0.0


class CitationValidator:
    """Validates and fixes citation references in generated text."""

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def validate(self, text: str, registry: CitationRegistry,
                 *, exclude_references_section: bool = True) -> ValidationResult:
        """Scan *text* for ``[N]`` markers, compare against *registry*.

        Parameters
        ----------
        text:
            Full report body (may include the references section).
        registry:
            The authoritative citation registry.
        exclude_references_section:
            If True, strip the trailing 参考文献 section so that the
            bibliography entries themselves are not counted as "used".
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
        """Remove invalid ``[N]`` references (where N ∉ registry).

        Does **not** renumber — that would require rewriting every
        reference across the whole document.
        """
        def _replacer(m: re.Match) -> str:
            num = int(m.group(1))
            if registry.is_valid(num):
                return m.group(0)
            return ""  # drop invalid ref

        return _CITATION_RE.sub(_replacer, text)

    def extract_used_numbers(self, text: str,
                             *, exclude_references_section: bool = True) -> List[int]:
        """Return sorted list of all [N] numbers found in *text*."""
        body = self._strip_references_section(text) if exclude_references_section else text
        return sorted({int(m.group(1)) for m in _CITATION_RE.finditer(body)})

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _strip_references_section(text: str) -> str:
        """Remove trailing 参考文献 / References section from text."""
        pattern = re.compile(
            r'^#{1,3}\s*[\d.]*\s*(?:参考文献|references|bibliography)\s*$',
            re.IGNORECASE | re.MULTILINE,
        )
        match = None
        for match in pattern.finditer(text):
            pass  # find the *last* occurrence
        if match:
            return text[:match.start()]
        return text
