"""Format audit checks for generated LaTeX."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from intelligen_engine.paper.models import FormatSpec


@dataclass(frozen=True)
class FormatAuditResult:
    passed: bool
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def audit_format(tex: str, spec: FormatSpec) -> FormatAuditResult:
    if spec.venue_label == "IEEE":
        return _audit_ieee(tex)
    return FormatAuditResult(
        passed=True,
        warnings=[f"no strict audit implemented for {spec.venue_label}"],
    )


def _audit_ieee(tex: str) -> FormatAuditResult:
    failures: list[str] = []
    if "IEEEtran" not in tex:
        failures.append("IEEE output must use IEEEtran document class")
    if "\\documentclass" in tex and "{article}" in tex:
        failures.append("IEEE output must not use article document class")
    if "\\tableofcontents" in tex:
        failures.append("IEEE output must not include table of contents")
    if "\\begin{IEEEkeywords}" not in tex:
        failures.append("IEEE output must include IEEEkeywords")
    if "\\bibliographystyle{IEEEtran}" not in tex and "\\bibliography{" in tex:
        failures.append("IEEE bibliography must use IEEEtran style")
    return FormatAuditResult(passed=not failures, failures=failures)
