"""Repair helpers for paper-mode audit failures."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field

from intelligen_engine.paper.audit import FormatAuditResult, audit_format
from intelligen_engine.paper.models import FormatSpec


@dataclass(frozen=True)
class RepairResult:
    attempted: bool
    passed: bool
    repaired_tex: str
    actions: list[str] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def repair_format(tex: str, spec: FormatSpec, audit: FormatAuditResult) -> RepairResult:
    if audit.passed:
        return RepairResult(attempted=False, passed=True, repaired_tex=tex)
    if spec.venue_label != "IEEE":
        return RepairResult(
            attempted=False,
            passed=False,
            repaired_tex=tex,
            failures=audit.failures,
        )

    repaired = tex
    actions: list[str] = []
    class_options = ",".join(
        [f"{spec.font_size_pt}pt", f"{spec.paper}paper", *spec.document_class_options]
    )
    repaired, count = re.subn(
        r"\\documentclass(?:\[[^\]]*\])?\{article\}",
        rf"\\documentclass[{class_options}]{{IEEEtran}}",
        repaired,
        count=1,
    )
    if count:
        actions.append("replace article document class with IEEEtran")
    if "\\tableofcontents" in repaired:
        repaired = repaired.replace("\\tableofcontents", "")
        actions.append("remove table of contents")
    if "\\begin{IEEEkeywords}" not in repaired:
        repaired = repaired.replace(
            "\\end{abstract}",
            "\\end{abstract}\n\n\\begin{IEEEkeywords}\npaper generation, format audit\n\\end{IEEEkeywords}",
            1,
        )
        actions.append("insert IEEEkeywords block")
    if "\\bibliography{" in repaired and "\\bibliographystyle{IEEEtran}" not in repaired:
        repaired = re.sub(
            r"\\bibliographystyle\{[^}]+\}",
            "\\bibliographystyle{IEEEtran}",
            repaired,
            count=1,
        )
        if "\\bibliographystyle{IEEEtran}" not in repaired:
            repaired = repaired.replace("\\bibliography{", "\\bibliographystyle{IEEEtran}\n\\bibliography{", 1)
        actions.append("enforce IEEEtran bibliography style")

    repaired_audit = audit_format(repaired, spec)
    return RepairResult(
        attempted=True,
        passed=repaired_audit.passed,
        repaired_tex=repaired,
        actions=actions,
        failures=repaired_audit.failures,
    )
