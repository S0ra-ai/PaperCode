"""Academic paper generation kernel for IntelliGen."""

from intelligen_engine.paper.audit import FormatAuditResult, audit_format
from intelligen_engine.paper.citation_audit import CitationAuditResult, audit_citations
from intelligen_engine.paper.docx import render_docx
from intelligen_engine.paper.format_policy import FormatDecision, resolve_format
from intelligen_engine.paper.intervention import (
    InterventionPlan,
    apply_intervention,
    plan_intervention,
)
from intelligen_engine.paper.latex import LatexBundle, render_latex
from intelligen_engine.paper.models import (
    FormatIntent,
    FormatSpec,
    PaperDraft,
    PaperSection,
)
from intelligen_engine.paper.rubric import ContentRubricResult, audit_content_rubric
from intelligen_engine.paper.repair import RepairResult, repair_format
from intelligen_engine.paper.research import (
    ResearchContext,
    assess_novelty,
    audit_figures_tables,
    audit_metadata_consistency,
    audit_question_quality,
    browse_code,
    classify_paper_type,
    ingest_materials,
    plan_experiment,
    plan_experiment_adjustment,
    plan_questions,
    plan_research,
    prefill_metadata,
    route_input,
    suggest_code_directions,
)
from intelligen_engine.paper.runner import PaperRunRequest, PaperRunResult, generate_paper
from intelligen_engine.paper.workflow import (
    DEFAULT_STAGE_ORDER,
    PaperStage,
    PaperStageEvent,
    initial_stage_events,
)

__all__ = [
    "FormatAuditResult",
    "CitationAuditResult",
    "ContentRubricResult",
    "FormatDecision",
    "FormatIntent",
    "FormatSpec",
    "InterventionPlan",
    "LatexBundle",
    "PaperDraft",
    "PaperRunRequest",
    "PaperRunResult",
    "PaperStage",
    "PaperStageEvent",
    "PaperSection",
    "RepairResult",
    "ResearchContext",
    "DEFAULT_STAGE_ORDER",
    "audit_format",
    "audit_citations",
    "audit_content_rubric",
    "generate_paper",
    "initial_stage_events",
    "apply_intervention",
    "assess_novelty",
    "audit_figures_tables",
    "audit_metadata_consistency",
    "audit_question_quality",
    "browse_code",
    "classify_paper_type",
    "ingest_materials",
    "plan_experiment",
    "plan_experiment_adjustment",
    "plan_intervention",
    "plan_questions",
    "plan_research",
    "prefill_metadata",
    "repair_format",
    "render_latex",
    "render_docx",
    "resolve_format",
    "route_input",
    "suggest_code_directions",
]
