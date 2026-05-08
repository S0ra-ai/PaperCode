"""Citation/source audit for paper-mode output."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class CitationAuditResult:
    passed: bool
    checked_entries: int = 0
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    manual_overrides: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def audit_citations(
    bibtex: str,
    *,
    manual_overrides: list[str] | None = None,
) -> CitationAuditResult:
    overrides = set(manual_overrides or [])
    entries = _parse_bibtex_entries(bibtex)
    if not entries:
        return CitationAuditResult(
            passed=True,
            warnings=["no citations emitted; citation verification is not required"],
        )

    failures: list[str] = []
    used_overrides: list[str] = []
    for key, body in entries.items():
        if _has_source_identifier(body):
            continue
        if key in overrides:
            used_overrides.append(key)
            continue
        failures.append(f"{key}: missing DOI or URL")

    return CitationAuditResult(
        passed=not failures,
        checked_entries=len(entries),
        failures=failures,
        manual_overrides=used_overrides,
    )


def _parse_bibtex_entries(bibtex: str) -> dict[str, str]:
    entries: dict[str, str] = {}
    for match in re.finditer(r"@\w+\s*\{\s*([^,\s]+)\s*,", bibtex):
        key = match.group(1).strip()
        start = match.end()
        next_entry = bibtex.find("\n@", start)
        body = bibtex[start:] if next_entry == -1 else bibtex[start:next_entry]
        entries[key] = body
    return entries


def _has_source_identifier(entry_body: str) -> bool:
    return bool(re.search(r"\b(doi|url)\s*=", entry_body, flags=re.IGNORECASE))
