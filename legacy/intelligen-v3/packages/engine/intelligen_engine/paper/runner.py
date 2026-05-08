"""Direct paper-mode runner used by tests and early API integration."""

from __future__ import annotations

import json
import shutil
import subprocess
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path

from intelligen_engine.paper.audit import FormatAuditResult, audit_format
from intelligen_engine.paper.citation_audit import CitationAuditResult, audit_citations
from intelligen_engine.paper.docx import render_docx
from intelligen_engine.paper.format_policy import FormatDecision, resolve_format
from intelligen_engine.paper.latex import render_latex
from intelligen_engine.paper.models import FormatIntent, FormatSpec, PaperDraft, PaperSection
from intelligen_engine.paper.rubric import ContentRubricResult, audit_content_rubric
from intelligen_engine.paper.repair import RepairResult, repair_format


@dataclass(frozen=True)
class PaperRunRequest:
    topic: str
    output_dir: Path
    venue_label: str = "IEEE"
    variant: str | None = "conference"
    authors: list[str] | None = None
    compile_pdf: bool = True
    manual_citation_overrides: list[str] | None = None
    target_word_count: int | None = None


@dataclass(frozen=True)
class PaperRunResult:
    tex_path: Path
    bib_path: Path
    docx_path: Path
    pdf_path: Path
    audit_path: Path
    source_bundle_path: Path
    format_decision: FormatDecision
    audit: FormatAuditResult
    citation_audit: CitationAuditResult
    content_rubric: ContentRubricResult
    repair: RepairResult
    pdf_compiled: bool

    def to_dict(self) -> dict[str, object]:
        data = asdict(self)
        data["tex_path"] = str(self.tex_path)
        data["bib_path"] = str(self.bib_path)
        data["docx_path"] = str(self.docx_path)
        data["pdf_path"] = str(self.pdf_path)
        data["audit_path"] = str(self.audit_path)
        data["source_bundle_path"] = str(self.source_bundle_path)
        return data


def generate_paper(
    request: PaperRunRequest,
    *,
    sample_spec: FormatSpec | None = None,
) -> PaperRunResult:
    """Generate a deterministic paper scaffold with strict format enforcement."""

    request.output_dir.mkdir(parents=True, exist_ok=True)
    decision = resolve_format(
        FormatIntent(venue_label=request.venue_label, variant=request.variant),
        sample_spec=sample_spec,
    )
    draft = _scaffold_draft(request)
    bundle = render_latex(draft, decision.spec)
    audit = audit_format(bundle.tex, decision.spec)
    if not audit.passed:
        repair = repair_format(bundle.tex, decision.spec, audit)
        if not repair.passed:
            raise RuntimeError(f"format audit failed: {'; '.join(repair.failures)}")
        bundle = type(bundle)(
            tex=repair.repaired_tex,
            bib=bundle.bib,
            template_hint=bundle.template_hint,
        )
        audit = audit_format(bundle.tex, decision.spec)
    else:
        repair = repair_format(bundle.tex, decision.spec, audit)
    citation_audit = audit_citations(
        bundle.bib,
        manual_overrides=request.manual_citation_overrides,
    )
    if not citation_audit.passed:
        raise RuntimeError(
            f"citation audit failed: {'; '.join(citation_audit.failures)}"
        )
    content_rubric = audit_content_rubric(
        draft,
        target_word_count=request.target_word_count,
    )
    if not content_rubric.passed:
        raise RuntimeError(
            f"content rubric failed: missing sections {', '.join(content_rubric.missing_sections)}"
        )

    tex_path = request.output_dir / "paper.tex"
    bib_path = request.output_dir / "references.bib"
    docx_path = request.output_dir / "paper.docx"
    pdf_path = request.output_dir / "paper.pdf"
    audit_path = request.output_dir / "audit.json"
    source_bundle_path = request.output_dir / "source_bundle.zip"
    tex_path.write_text(bundle.tex, encoding="utf-8")
    bib_path.write_text(bundle.bib, encoding="utf-8")
    docx_path.write_bytes(render_docx(draft, decision.spec))
    pdf_compiled = False
    compile_report: dict[str, object] = {"enabled": request.compile_pdf}
    if request.compile_pdf:
        compile_report = compile_latex_pdf(tex_path)
        pdf_compiled = bool(compile_report["passed"])
        if not pdf_compiled:
            raise RuntimeError(f"PDF compile failed: {compile_report['error']}")
    audit_path.write_text(
        json.dumps(
            {
                "format_decision": {
                    "source": decision.source,
                    "conflicts": decision.conflicts,
                    "warnings": decision.warnings,
                    "spec": decision.spec.to_dict(),
                },
                "format_audit": audit.to_dict(),
                "repair": repair.to_dict(),
                "citation_audit": citation_audit.to_dict(),
                "content_rubric": content_rubric.to_dict(),
                "docx_export": {
                    "passed": docx_path.is_file(),
                    "path": str(docx_path),
                },
                "pdf_compile": compile_report,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    _write_source_bundle(
        source_bundle_path,
        [tex_path, bib_path, docx_path, pdf_path, audit_path],
    )
    return PaperRunResult(
        tex_path=tex_path,
        bib_path=bib_path,
        docx_path=docx_path,
        pdf_path=pdf_path,
        audit_path=audit_path,
        source_bundle_path=source_bundle_path,
        format_decision=decision,
        audit=audit,
        citation_audit=citation_audit,
        content_rubric=content_rubric,
        repair=repair,
        pdf_compiled=pdf_compiled,
    )


def _write_source_bundle(bundle_path: Path, paths: list[Path]) -> None:
    with zipfile.ZipFile(bundle_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in paths:
            if path.is_file():
                zf.write(path, arcname=path.name)


def compile_latex_pdf(tex_path: Path) -> dict[str, object]:
    tex = tex_path.read_text(encoding="utf-8")
    has_unicode = any(ord(ch) > 127 for ch in tex)
    latexmk = shutil.which("latexmk")
    xelatex = shutil.which("xelatex")
    pdflatex = shutil.which("pdflatex")
    compiler = latexmk or (xelatex if has_unicode else None) or pdflatex or xelatex
    if compiler is None:
        return {
            "passed": False,
            "compiler": None,
            "error": "No LaTeX compiler found on PATH (latexmk or pdflatex required)",
        }

    if Path(compiler).name.lower().startswith("latexmk"):
        engine_arg = "-xelatex" if has_unicode and xelatex else "-pdf"
        cmd = [
            compiler,
            engine_arg,
            "-interaction=nonstopmode",
            "-halt-on-error",
            tex_path.name,
        ]
    else:
        cmd = [
            compiler,
            "-interaction=nonstopmode",
            "-halt-on-error",
            tex_path.name,
        ]

    proc = subprocess.run(
        cmd,
        cwd=tex_path.parent,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=120,
        check=False,
    )
    output_tail = proc.stdout[-4000:] if proc.stdout else ""
    pdf_path = tex_path.with_suffix(".pdf")
    return {
        "passed": proc.returncode == 0 and pdf_path.is_file(),
        "compiler": Path(compiler).name,
        "engine": "xelatex" if has_unicode and (Path(compiler).name.lower().startswith("xelatex") or Path(compiler).name.lower().startswith("latexmk")) and xelatex else "pdflatex",
        "returncode": proc.returncode,
        "pdf_path": str(pdf_path),
        "error": "" if proc.returncode == 0 and pdf_path.is_file() else output_tail,
    }


def _scaffold_draft(request: PaperRunRequest) -> PaperDraft:
    topic = request.topic.strip() or "Untitled Research Topic"
    return PaperDraft(
        title=topic,
        abstract=(
            "This scaffold reserves the final paper structure without inventing "
            "unverified experimental results."
        ),
        keywords=["paper generation", "format audit", "research workflow"],
        authors=request.authors or ["Anonymous"],
        sections=[
            PaperSection(
                title="Introduction",
                paragraphs=[
                    (
                        "This section should motivate the research problem, define "
                        "the scope, and summarize the expected contribution."
                    )
                ],
            ),
            PaperSection(
                title="Related Work",
                paragraphs=[
                    (
                        "This section should compare verified prior studies and "
                        "identify the gap this paper addresses."
                    )
                ],
            ),
            PaperSection(
                title="Method",
                paragraphs=[
                    (
                        "This section is reserved for the verified method, system, "
                        "or analysis workflow selected during planning."
                    )
                ],
            ),
            PaperSection(
                title="Evaluation Plan",
                paragraphs=[
                    (
                        "Experiments must be filled from actual data and execution "
                        "traces; until then they remain a proposal."
                    )
                ],
            ),
            PaperSection(
                title="Discussion",
                paragraphs=[
                    (
                        "This section should discuss limitations, threats to "
                        "validity, and conditions under which the method may fail."
                    )
                ],
            ),
            PaperSection(
                title="Conclusion and Future Work",
                paragraphs=[
                    (
                        "This section should summarize the verified contribution "
                        "and list concrete next steps before final submission."
                    )
                ],
            ),
        ],
    )
