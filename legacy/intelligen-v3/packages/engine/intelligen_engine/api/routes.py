"""Engine API routes — internal endpoints consumed by API Gateway."""

from __future__ import annotations

import asyncio
import json
import logging
from enum import Enum
from pathlib import Path
from typing import Optional

import yaml

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

router = APIRouter()
logger = logging.getLogger(__name__)

# Singleton set at startup by main.py lifespan
_task_manager = None
_index_service = None


def set_task_manager(tm):
    global _task_manager
    _task_manager = tm


def set_index_service(svc):
    global _index_service
    _index_service = svc


def _get_tm():
    if _task_manager is None:
        raise HTTPException(status_code=503, detail="Engine not ready")
    return _task_manager


def _get_index_service():
    if _index_service is None:
        raise HTTPException(status_code=503, detail="IndexService not initialized")
    return _index_service


# ─── Schemas ───────────────────────────────────────────────

class TaskStatus(str, Enum):
    pending = "pending"
    clarifying = "clarifying"
    planning = "planning"
    generating = "generating"
    reviewing = "reviewing"
    exporting = "exporting"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class TaskSubmitRequest(BaseModel):
    task_id: str
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    # Accept both 'topic' and 'user_input' for API compatibility
    topic: Optional[str] = None
    user_input: Optional[str] = None
    answers: Optional[dict] = None
    outline: Optional[list | str] = None
    template_id: Optional[str] = None
    template_content: Optional[str] = None
    attachments: Optional[list[str]] = None
    user_file_paths: Optional[list[str]] = None
    requirement: Optional[str] = None
    citation_style: str = "GB/T 7714"
    target_word_count: Optional[int] = None
    generation_mode: str = "legacy_report"
    venue_label: Optional[str] = None
    venue_variant: Optional[str] = None
    authors: Optional[list[str]] = None
    control_mode: str = "batch_autopilot"
    manual_citation_overrides: Optional[list[str]] = None

    @property
    def resolved_topic(self) -> str:
        return self.topic or self.user_input or ""

    @property
    def resolved_attachments(self) -> list[str]:
        return self.attachments or self.user_file_paths or []


class TaskStatusResponse(BaseModel):
    task_id: str
    status: TaskStatus
    progress_pct: float = 0.0
    current_stage: Optional[str] = None
    result_url: Optional[str] = None
    error: Optional[str] = None
    result_markdown: Optional[str] = None
    artifact_paths: dict[str, str] = Field(default_factory=dict)


class ClarifyRequest(BaseModel):
    task_id: str
    user_input: str
    context: Optional[dict] = None


class ClarifyQuestion(BaseModel):
    question: str
    options: list[str] = []
    allow_multiple: bool = False
    allow_custom: bool = True
    explanation: Optional[str] = None
    is_complete: bool = False


class ClarifyResponse(BaseModel):
    task_id: str
    question: Optional[ClarifyQuestion] = None
    is_complete: bool = False
    collected_info: dict = {}


# Progressive clarification schemas
class ClarifyNextRequest(BaseModel):
    task_id: str
    topic: str
    history: list[dict] = Field(default_factory=list)
    document_info: Optional[dict] = None


class ClarifyNextResponse(BaseModel):
    task_id: str
    question: Optional[ClarifyQuestion] = None
    is_complete: bool = False
    step: int = 0


class ClarifyAnswerRequest(BaseModel):
    task_id: str
    topic: str
    history: list[dict] = Field(default_factory=list)
    answer: str = ""
    document_info: Optional[dict] = None


class ClarifySkipRequest(BaseModel):
    task_id: str
    topic: str
    history: list[dict] = Field(default_factory=list)
    document_info: Optional[dict] = None


class ClarifyFinishRequest(BaseModel):
    task_id: str
    topic: str
    history: list[dict] = Field(default_factory=list)
    document_info: Optional[dict] = None


class ClarifyFinishResponse(BaseModel):
    task_id: str
    summary: dict = {}
    requirement: str = ""


class DocumentExtractRequest(BaseModel):
    task_id: str
    text_excerpt: str
    file_name: str = ""


class DocumentExtractResponse(BaseModel):
    task_id: str
    title: str = ""
    abstract: str = ""
    keywords: list[str] = []
    methodology: str = ""


class OutlineRequest(BaseModel):
    task_id: str
    topic: str
    clarification_answers: dict = {}
    template_id: Optional[str] = None


class OutlineSection(BaseModel):
    title: str
    description: str
    subsections: list[str] = []


class OutlineResponse(BaseModel):
    task_id: str
    sections: list[OutlineSection]


class PaperFormatResolveRequest(BaseModel):
    venue_label: str = "IEEE"
    venue_variant: Optional[str] = "conference"
    conflict_policy: str = "prefer_explicit"
    sample_spec: Optional[dict] = None


class PaperFormatResolveResponse(BaseModel):
    spec: dict
    source: str
    conflicts: list[str] = []
    warnings: list[str] = []
    requires_confirmation: bool = False


class PaperCitationAuditRequest(BaseModel):
    bibtex: str = ""
    manual_overrides: list[str] = []


class PaperCitationAuditResponse(BaseModel):
    passed: bool
    checked_entries: int = 0
    failures: list[str] = []
    warnings: list[str] = []
    manual_overrides: list[str] = []


class PaperInterventionPlanRequest(BaseModel):
    message: str = Field(..., min_length=1)
    available_sections: list[str] = []


class PaperInterventionPlanResponse(BaseModel):
    target_sections: list[str]
    action_plan: list[str]
    required_audits: list[str]
    warnings: list[str] = []


class PaperResearchContextRequest(BaseModel):
    user_input: str = ""
    uploaded_files: list[str] = []
    code_files: list[str] = []
    control_mode: str = "batch_autopilot"
    hint: str = ""
    metadata: dict = {}
    items: list[dict] = []
    reason: str = ""


class PaperStageContractResponse(BaseModel):
    stages: list[dict]


class MetricsResponse(BaseModel):
    active_tasks: int = 0
    queue_depth: int = 0
    rpm_current: float = 0.0
    tpm_current: float = 0.0
    models: dict = {}


# ─── Task Routes ───────────────────────────────────────────


@router.get("/paper/stages", response_model=PaperStageContractResponse)
async def paper_stage_contract():
    """Return the first paper-agent stage contract for WebUI rendering."""
    from intelligen_engine.paper import initial_stage_events

    return PaperStageContractResponse(
        stages=[event.to_dict() for event in initial_stage_events()]
    )


@router.post("/paper/format/resolve", response_model=PaperFormatResolveResponse)
async def resolve_paper_format(request: PaperFormatResolveRequest):
    """Resolve venue format and report conflicts without starting generation."""
    from intelligen_engine.paper import FormatIntent, FormatSpec, resolve_format

    try:
        sample_spec = FormatSpec(**request.sample_spec) if request.sample_spec else None
        decision = resolve_format(
            FormatIntent(
                venue_label=request.venue_label,
                variant=request.venue_variant,
                conflict_policy=request.conflict_policy,  # type: ignore[arg-type]
            ),
            sample_spec=sample_spec,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PaperFormatResolveResponse(
        spec=decision.spec.to_dict(),
        source=decision.source,
        conflicts=decision.conflicts,
        warnings=decision.warnings,
        requires_confirmation=(
            bool(decision.conflicts) and request.conflict_policy == "ask"
        ),
    )


@router.post("/paper/citations/audit", response_model=PaperCitationAuditResponse)
async def audit_paper_citations(request: PaperCitationAuditRequest):
    """Validate BibTeX source identifiers and explicit manual overrides."""
    from intelligen_engine.paper.citation_audit import audit_citations

    result = audit_citations(
        request.bibtex,
        manual_overrides=request.manual_overrides,
    )
    return PaperCitationAuditResponse(**result.to_dict())


@router.post("/paper/interventions/plan", response_model=PaperInterventionPlanResponse)
async def plan_paper_intervention(request: PaperInterventionPlanRequest):
    """Plan a preview intervention without mutating draft artifacts."""
    from intelligen_engine.paper import plan_intervention

    return PaperInterventionPlanResponse(
        **plan_intervention(
            request.message,
            available_sections=request.available_sections,
        ).to_dict()
    )


@router.post("/paper/input/route")
async def route_paper_input(request: PaperResearchContextRequest):
    from intelligen_engine.paper import route_input

    return route_input(
        request.user_input,
        uploaded_files=request.uploaded_files,
        code_files=request.code_files,
    ).to_dict()


@router.post("/paper/questions/plan")
async def plan_paper_questions(request: PaperResearchContextRequest):
    from intelligen_engine.paper import plan_questions, route_input

    context = route_input(
        request.user_input,
        uploaded_files=request.uploaded_files,
        code_files=request.code_files,
    )
    return plan_questions(context, control_mode=request.control_mode)


@router.post("/paper/research/plan")
async def plan_paper_research(request: PaperResearchContextRequest):
    from intelligen_engine.paper import plan_research, route_input

    context = route_input(
        request.user_input,
        uploaded_files=request.uploaded_files,
        code_files=request.code_files,
    )
    return plan_research(context)


@router.post("/paper/metadata/prefill")
async def prefill_paper_metadata(request: PaperResearchContextRequest):
    from intelligen_engine.paper import prefill_metadata

    return prefill_metadata(request.user_input)


@router.post("/paper/code/directions")
async def suggest_paper_code_directions(request: PaperResearchContextRequest):
    from intelligen_engine.paper import suggest_code_directions

    return {"directions": suggest_code_directions(request.code_files or request.uploaded_files)}


@router.post("/paper/materials/ingest")
async def ingest_paper_materials(request: PaperResearchContextRequest):
    from intelligen_engine.paper import ingest_materials

    return ingest_materials(request.uploaded_files)


@router.post("/paper/code/browse")
async def browse_paper_code(request: PaperResearchContextRequest):
    from intelligen_engine.paper import browse_code

    return browse_code(request.code_files or request.uploaded_files)


@router.post("/paper/type/classify")
async def classify_paper_type_route(request: PaperResearchContextRequest):
    from intelligen_engine.paper import classify_paper_type, route_input

    context = route_input(
        request.user_input,
        uploaded_files=request.uploaded_files,
        code_files=request.code_files,
    )
    return classify_paper_type(context, request.hint)


@router.post("/paper/novelty/assess")
async def assess_paper_novelty(request: PaperResearchContextRequest):
    from intelligen_engine.paper import assess_novelty, route_input

    context = route_input(
        request.user_input,
        uploaded_files=request.uploaded_files,
        code_files=request.code_files,
    )
    return assess_novelty(context)


@router.post("/paper/experiments/plan")
async def plan_paper_experiment(request: PaperResearchContextRequest):
    from intelligen_engine.paper import plan_experiment, route_input

    context = route_input(
        request.user_input,
        uploaded_files=request.uploaded_files,
        code_files=request.code_files,
    )
    return plan_experiment(context)


@router.post("/paper/experiments/adjust")
async def adjust_paper_experiment(request: PaperResearchContextRequest):
    from intelligen_engine.paper import plan_experiment_adjustment

    return plan_experiment_adjustment(request.reason or request.user_input)


@router.post("/paper/questions/audit")
async def audit_paper_questions(request: PaperResearchContextRequest):
    from intelligen_engine.paper import audit_question_quality, plan_questions, route_input

    context = route_input(
        request.user_input,
        uploaded_files=request.uploaded_files,
        code_files=request.code_files,
    )
    return audit_question_quality(plan_questions(context, control_mode=request.control_mode))


@router.post("/paper/metadata/audit")
async def audit_paper_metadata(request: PaperResearchContextRequest):
    from intelligen_engine.paper import audit_metadata_consistency

    return audit_metadata_consistency(request.metadata)


@router.post("/paper/figures/audit")
async def audit_paper_figures(request: PaperResearchContextRequest):
    from intelligen_engine.paper import audit_figures_tables

    return audit_figures_tables(request.items)

@router.post("/tasks", response_model=TaskStatusResponse)
async def submit_task(request: TaskSubmitRequest):
    """Submit a new generation task."""
    tm = _get_tm()
    # Normalize the task data using resolved properties
    task_data = request.model_dump()
    task_data["topic"] = request.resolved_topic
    task_data["attachments"] = request.resolved_attachments
    result = await tm.submit_task(task_data)
    return TaskStatusResponse(
        task_id=request.task_id,
        status=TaskStatus(result.get("status", "pending")),
        progress_pct=result.get("progress_pct", 0.0),
        current_stage=result.get("current_stage"),
        error=result.get("error"),
        result_markdown=result.get("result_markdown"),
        artifact_paths=result.get("artifact_paths") or {},
    )


@router.get("/tasks/{task_id}/status", response_model=TaskStatusResponse)
async def get_task_status(task_id: str):
    """Get current task status."""
    tm = _get_tm()
    status = await tm.get_status(task_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskStatusResponse(
        task_id=task_id,
        status=TaskStatus(status.get("status", "pending")),
        progress_pct=status.get("progress_pct", 0.0),
        current_stage=status.get("current_stage"),
        result_url=status.get("result_url"),
        error=status.get("error"),
        result_markdown=status.get("result_markdown"),
        artifact_paths=status.get("artifact_paths") or {},
    )


@router.get("/tasks/{task_id}/stream")
async def stream_task_progress(task_id: str):
    """SSE endpoint for real-time task progress."""
    from intelligen_engine.core.redis import subscribe_progress

    async def event_generator():
        try:
            async for event in subscribe_progress(task_id):
                data = json.dumps(event, ensure_ascii=False)
                yield f"data: {data}\n\n"
                if event.get("status") in ("completed", "failed", "cancelled"):
                    break
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Cancel a running task."""
    tm = _get_tm()
    cancelled = await tm.cancel_task(task_id)
    return {"task_id": task_id, "cancelled": cancelled}


@router.post("/tasks/{task_id}/export")
async def export_task(task_id: str, fmt: str = "docx"):
    """导出任务结果为指定格式 (latex/docx/pdf/md)"""
    from io import BytesIO
    from intelligen_engine.pipeline.export.format_converter import ExportPipeline

    tm = _get_tm()
    status = await tm.get_status(task_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")

    artifact_paths = status.get("artifact_paths") or {}
    artifact_aliases = {
        "tex": "tex_path",
        "latex": "tex_path",
        "bib": "bib_path",
        "bibtex": "bib_path",
        "docx": "docx_path",
        "pdf": "pdf_path",
        "audit": "audit_path",
        "source": "source_bundle_path",
        "bundle": "source_bundle_path",
        "source_bundle": "source_bundle_path",
    }
    artifact_key = artifact_aliases.get(fmt.lower())
    if artifact_key and artifact_paths.get(artifact_key):
        path = Path(artifact_paths[artifact_key])
        if not path.is_file():
            raise HTTPException(status_code=404, detail="导出产物不存在")
        content = path.read_bytes()
        ext = path.suffix.lstrip(".") or fmt
        mime = {
            "tex": "application/x-tex",
            "bib": "text/x-bibtex",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "json": "application/json",
        }.get(ext, "application/octet-stream")
        filename = path.name
        return StreamingResponse(
            BytesIO(content),
            media_type=mime,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    markdown = status.get("result_markdown") or ""
    if not markdown:
        raise HTTPException(status_code=400, detail="任务尚无可导出的内容")

    try:
        content, ext, mime = ExportPipeline.export(markdown, fmt)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    filename = f"report-{task_id[:8]}.{ext}"
    return StreamingResponse(
        BytesIO(content),
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Legacy Clarify Route (batch questions) ─────────────────

@router.post("/clarify", response_model=ClarifyResponse)
async def clarify(request: ClarifyRequest):
    """Generate next clarification question (legacy batch mode)."""
    try:
        from intelligen_engine.pipeline.clarification.clarify_service import ClarifyService
        from intelligen_engine.pipeline.shared.llm_service import LLMService

        svc = ClarifyService(LLMService())
        check = svc.check_needs_clarification(request.user_input)

        if not check.needs_clarification:
            return ClarifyResponse(
                task_id=request.task_id,
                is_complete=True,
                collected_info={"topic": request.user_input},
            )

        questions = await svc.generate_questions(request.user_input)
        first = questions[0] if questions else None
        question_out = None
        if first:
            question_out = ClarifyQuestion(
                question=first.question,
                options=first.options,
                allow_custom=True,
                explanation=first.hint,
            )
        return ClarifyResponse(
            task_id=request.task_id,
            question=question_out,
            is_complete=False,
        )
    except Exception as e:
        logger.error(f"Clarification failed: {e}")
        return ClarifyResponse(
            task_id=request.task_id,
            is_complete=True,
            collected_info={"topic": request.user_input},
        )


# ─── Progressive Clarification Routes ───────────────────────

@router.post("/clarify/next", response_model=ClarifyNextResponse)
async def clarify_next(request: ClarifyNextRequest):
    """Get the next clarification question based on topic + history."""
    try:
        from intelligen_engine.pipeline.clarification.clarification_agent import ClarificationAgent
        from intelligen_engine.pipeline.shared.llm_service import LLMService

        def _get_next_question():
            agent = ClarificationAgent(LLMService())
            return asyncio.run(agent.get_next_question(
                topic=request.topic,
                history=request.history,
                document_info=request.document_info,
            ))

        result = await asyncio.to_thread(_get_next_question)

        question_out = None
        if not result.is_complete:
            question_out = ClarifyQuestion(
                question=result.question,
                options=result.options,
                allow_multiple=result.allow_multiple,
                allow_custom=result.allow_custom,
                explanation=result.explanation,
                is_complete=result.is_complete,
            )

        return ClarifyNextResponse(
            task_id=request.task_id,
            question=question_out,
            is_complete=result.is_complete,
            step=len(request.history),
        )
    except Exception as e:
        logger.error(f"Progressive clarification failed: {e}")
        return ClarifyNextResponse(
            task_id=request.task_id,
            is_complete=True,
            step=len(request.history),
        )


@router.post("/clarify/answer", response_model=ClarifyNextResponse)
async def clarify_answer(request: ClarifyAnswerRequest):
    """Submit answer to current question and get next question."""
    try:
        from intelligen_engine.pipeline.clarification.clarification_agent import ClarificationAgent
        from intelligen_engine.pipeline.shared.llm_service import LLMService

        # Append the new answer to history and get next question
        updated_history = list(request.history)
        if updated_history and request.answer:
            # The last entry should have the question; add the answer
            if updated_history[-1].get("answer") in (None, "", "(skipped)"):
                updated_history[-1]["answer"] = request.answer

        def _get_next_question():
            agent = ClarificationAgent(LLMService())
            return asyncio.run(agent.get_next_question(
                topic=request.topic,
                history=updated_history,
                document_info=request.document_info,
            ))

        result = await asyncio.to_thread(_get_next_question)

        question_out = None
        if not result.is_complete:
            question_out = ClarifyQuestion(
                question=result.question,
                options=result.options,
                allow_multiple=result.allow_multiple,
                allow_custom=result.allow_custom,
                explanation=result.explanation,
                is_complete=result.is_complete,
            )

        return ClarifyNextResponse(
            task_id=request.task_id,
            question=question_out,
            is_complete=result.is_complete,
            step=len(updated_history),
        )
    except Exception as e:
        logger.error(f"Clarification answer processing failed: {e}")
        return ClarifyNextResponse(
            task_id=request.task_id,
            is_complete=True,
            step=len(request.history),
        )


@router.post("/clarify/skip", response_model=ClarifyNextResponse)
async def clarify_skip(request: ClarifySkipRequest):
    """Skip current question and get next."""
    try:
        from intelligen_engine.pipeline.clarification.clarification_agent import ClarificationAgent
        from intelligen_engine.pipeline.shared.llm_service import LLMService

        # Mark last question as skipped
        updated_history = list(request.history)
        if updated_history and not updated_history[-1].get("answer"):
            updated_history[-1]["answer"] = "(skipped)"

        def _get_next_question():
            agent = ClarificationAgent(LLMService())
            return asyncio.run(agent.get_next_question(
                topic=request.topic,
                history=updated_history,
                document_info=request.document_info,
            ))

        result = await asyncio.to_thread(_get_next_question)

        question_out = None
        if not result.is_complete:
            question_out = ClarifyQuestion(
                question=result.question,
                options=result.options,
                allow_multiple=result.allow_multiple,
                allow_custom=result.allow_custom,
                explanation=result.explanation,
                is_complete=result.is_complete,
            )

        return ClarifyNextResponse(
            task_id=request.task_id,
            question=question_out,
            is_complete=result.is_complete,
            step=len(updated_history),
        )
    except Exception as e:
        logger.error(f"Clarification skip failed: {e}")
        return ClarifyNextResponse(
            task_id=request.task_id,
            is_complete=True,
            step=len(request.history),
        )


@router.post("/clarify/finish", response_model=ClarifyFinishResponse)
async def clarify_finish(request: ClarifyFinishRequest):
    """Mark clarification complete and return summary."""
    try:
        from intelligen_engine.pipeline.clarification.clarification_agent import ClarificationAgent
        from intelligen_engine.pipeline.shared.llm_service import LLMService

        def _get_summary():
            agent = ClarificationAgent(LLMService())
            return asyncio.run(agent.get_summary(
                topic=request.topic,
                history=request.history,
                document_info=request.document_info,
            ))

        summary = await asyncio.to_thread(_get_summary)

        # Build a requirement string from the summary
        requirement_parts = [f"Topic: {summary.get('topic', request.topic)}"]
        for key in ("scope", "methodology", "target_audience", "time_range"):
            if summary.get(key):
                requirement_parts.append(f"{key.replace('_', ' ').title()}: {summary[key]}")
        if summary.get("key_focus_areas"):
            requirement_parts.append(f"Focus areas: {', '.join(summary['key_focus_areas'])}")
        if summary.get("additional_requirements"):
            requirement_parts.append(f"Additional: {summary['additional_requirements']}")
        requirement = "\n".join(requirement_parts)

        return ClarifyFinishResponse(
            task_id=request.task_id,
            summary=summary,
            requirement=requirement,
        )
    except Exception as e:
        logger.error(f"Clarification finish failed: {e}")
        return ClarifyFinishResponse(
            task_id=request.task_id,
            summary={"topic": request.topic},
            requirement=request.topic,
        )


@router.post("/clarify/extract-doc", response_model=DocumentExtractResponse)
async def extract_document_info(request: DocumentExtractRequest):
    """Extract key info from an uploaded document."""
    try:
        from intelligen_engine.pipeline.clarification.clarification_agent import ClarificationAgent
        from intelligen_engine.pipeline.shared.llm_service import LLMService

        def _extract_document_info():
            agent = ClarificationAgent(LLMService())
            return asyncio.run(agent.extract_document_info(
                text_excerpt=request.text_excerpt,
                file_name=request.file_name,
            ))

        info = await asyncio.to_thread(_extract_document_info)
        return DocumentExtractResponse(
            task_id=request.task_id,
            title=info.title,
            abstract=info.abstract,
            keywords=info.keywords,
            methodology=info.methodology,
        )
    except Exception as e:
        logger.error(f"Document extraction failed: {e}")
        return DocumentExtractResponse(task_id=request.task_id)


# ─── Outline & Other Routes ────────────────────────────────

@router.post("/outline", response_model=OutlineResponse)
async def generate_outline(request: OutlineRequest):
    """Generate report outline."""
    try:
        from intelligen_engine.pipeline.planning.outline_planner import OutlinePlanner
        from intelligen_engine.pipeline.shared.llm_service import LLMService

        planner = OutlinePlanner(llm=LLMService())

        requirement = ""
        if request.clarification_answers:
            requirement = "\n".join(
                f"- {v}" for v in request.clarification_answers.values()
                if isinstance(v, str) and v.strip()
            )

        loop = asyncio.get_running_loop()
        report_outline = await loop.run_in_executor(
            None,
            lambda: planner.plan(
                topic=request.topic,
                requirement=requirement,
            ),
        )

        sections = [
            OutlineSection(
                title=s.title,
                description=s.description or "",
                subsections=[sub for sub in (s.subsections or [])],
            )
            for s in report_outline.sections
        ]
        return OutlineResponse(task_id=request.task_id, sections=sections)
    except Exception as e:
        logger.error(f"Outline generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/models")
async def list_models():
    """List available models and their status."""
    from intelligen_engine.core.config import settings
    return {
        "chat": settings.LLM_CHAT_MODEL,
        "fast": settings.LLM_FAST_MODEL,
        "code": settings.LLM_CODE_MODEL,
        "search": settings.SEARCH_MODEL_NAME,
        "embedding": settings.EMBEDDING_MODEL_NAME,
    }


@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics():
    """Get engine metrics (RPM, TPM, queue depth)."""
    from intelligen_engine.core.config import settings

    tm = _get_tm()
    depth = await tm.queue_depth()

    return MetricsResponse(
        active_tasks=tm.active_count,
        queue_depth=depth,
        models={
            "chat": settings.resolved_chat_model,
            "fast": settings.resolved_fast_model,
        },
    )


# ─── Index Management Routes ──────────────────────────────────

@router.get("/indexes")
async def list_indexes():
    """List all persisted document indexes."""
    svc = _get_index_service()
    docs = svc.list_indexed_documents()
    return [
        {
            "doc_id": d.doc_id,
            "source_filename": d.source_filename,
            "file_size": d.file_size,
            "chunk_count": d.chunk_count,
            "indexed_at": d.indexed_at,
            "chunk_size": d.chunk_size,
            "chunk_overlap": d.chunk_overlap,
        }
        for d in docs
    ]


@router.get("/indexes/stats")
async def get_index_stats():
    """Get index statistics."""
    svc = _get_index_service()
    return svc.get_stats()


@router.delete("/indexes/{doc_id}")
async def delete_index(doc_id: str):
    """Delete a specific document index."""
    svc = _get_index_service()
    removed = svc.remove_index(doc_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Index not found")
    return {"doc_id": doc_id, "deleted": True}


@router.post("/indexes/{doc_id}/rebuild")
async def rebuild_index(doc_id: str, file_path: str):
    """Rebuild index for a document."""
    svc = _get_index_service()
    new_doc_id = svc.rebuild_index(doc_id, file_path)
    if new_doc_id is None:
        raise HTTPException(status_code=500, detail="Rebuild failed")
    return {"old_doc_id": doc_id, "new_doc_id": new_doc_id}


@router.get("/metrics/usage")
async def get_usage_metrics(days: int = 7):
    """Get per-model usage breakdown over N days (for admin dashboard)."""
    from intelligen_engine.core.metrics import get_metrics_collector
    collector = get_metrics_collector()

    model_usage = await collector.get_model_usage(days=days)
    daily_stats = await collector.get_daily_stats()
    rpm = await collector.get_realtime_rpm()
    health = await collector.get_system_health()

    return {
        "model_usage": model_usage,
        "daily_stats": daily_stats,
        "realtime_rpm": rpm,
        "system_health": health,
    }


# ─── Retrieval Observability (P11-9) ─────────────────────────

@router.get("/tasks/{task_id}/retrieval-trace")
async def get_retrieval_trace(task_id: str):
    """Get the retrieval trace for a completed task."""
    from intelligen_engine.pipeline.retrieval.retrieval_trace import RetrievalTrace
    trace = await RetrievalTrace.load_from_redis(task_id)
    if trace is None:
        raise HTTPException(status_code=404, detail="Retrieval trace not found")
    return trace.to_dict()


# ─── Template Parsing Routes ──────────────────────────────────

class TemplateParseRequest(BaseModel):
    content: str
    filename: str = ""


@router.post("/templates/parse")
async def parse_template(request: TemplateParseRequest):
    """Parse uploaded document content and extract formatting structure."""
    from intelligen_engine.pipeline.templates.template_parser import TemplateParser

    parser = TemplateParser()
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: parser.parse_to_dict(request.content, request.filename),
    )
    return {"format_json": result}


# ─── Code Analysis Routes ─────────────────────────────────────

class CodeAnalyzeRequest(BaseModel):
    filename: str
    content_base64: str
    is_zip: bool = False


class CodeOutlineRequest(BaseModel):
    analysis: dict


@router.post("/code/analyze")
async def analyze_code(request: CodeAnalyzeRequest):
    """Parse code file/ZIP and run architecture analysis."""
    import base64
    from intelligen_engine.pipeline.code.code_parser import (
        parse_code_file, parse_zip_archive,
    )
    from intelligen_engine.pipeline.code.code_agent import CodeAgent

    raw = base64.b64decode(request.content_base64)

    loop = asyncio.get_running_loop()

    if request.is_zip:
        code_analysis = await loop.run_in_executor(
            None, lambda: parse_zip_archive(raw),
        )
    else:
        code_analysis = await loop.run_in_executor(
            None, lambda: parse_code_file(request.filename, raw),
        )

    agent = CodeAgent()
    architecture = await loop.run_in_executor(
        None, lambda: agent.analyse_to_dict(code_analysis),
    )

    return {
        "code_analysis": code_analysis.to_dict(),
        "architecture": architecture,
    }


@router.post("/code/outline")
async def generate_code_outline(request: CodeOutlineRequest):
    """Generate a paper outline from code architecture analysis."""
    from intelligen_engine.pipeline.code.code_agent import CodeArchitectureAnalysis
    from intelligen_engine.pipeline.code.code_outline import CodeOutlineGenerator

    analysis = CodeArchitectureAnalysis(**request.analysis)

    generator = CodeOutlineGenerator()
    loop = asyncio.get_running_loop()
    outline = await loop.run_in_executor(
        None, lambda: generator.generate_to_dict(analysis),
    )
    return {"outline": outline}


# ─── Provider Test Endpoint ─────────────────────────────────


class ProviderTestRequest(BaseModel):
    api_format: str
    base_url: str
    api_key: str = ""
    name: str = "test"


@router.post("/providers/test")
async def test_provider_connectivity(req: ProviderTestRequest):
    """测试 LLM 提供商连通性 (由 API Gateway 调用)"""
    from intelligen_engine.core.providers.openai_compatible import OpenAICompatibleProvider
    from intelligen_engine.core.providers.anthropic_provider import AnthropicProvider
    from intelligen_engine.core.providers.google_provider import GoogleProvider

    provider_cls = {
        "openai_compatible": OpenAICompatibleProvider,
        "anthropic": AnthropicProvider,
        "google": GoogleProvider,
    }.get(req.api_format)

    if provider_cls is None:
        return {"healthy": False, "detail": f"未知的 api_format: {req.api_format}"}

    auth_required = bool(req.api_key)
    provider = provider_cls(
        name=req.name,
        base_url=req.base_url,
        api_key=req.api_key,
        timeout=15,
        auth_required=auth_required,
    )

    try:
        healthy = await provider.health_check()
        return {"healthy": healthy, "detail": "连通正常" if healthy else "健康检测返回失败"}
    except Exception as exc:
        return {"healthy": False, "detail": str(exc)}


class ProviderSpec(BaseModel):
    name: str
    api_format: str  # openai_compatible / anthropic / google
    base_url: str
    api_key: str = ""
    deployment_type: str = "cloud"
    auth_required: bool = True


class StageConfigSpec(BaseModel):
    stage: str
    provider_name: str
    model: str


class ProviderReloadRequest(BaseModel):
    providers: list[ProviderSpec] = Field(default_factory=list)
    stage_configs: list[StageConfigSpec] = Field(default_factory=list)
    fallback_chain: list[list[str]] = Field(default_factory=list)  # [[provider, model], ...]
    preserve_env_providers: bool = True


@router.post("/providers/reload")
async def reload_providers(req: ProviderReloadRequest):
    """重建 ProviderRegistry — 由 API Gateway 在 Provider CRUD 后调用。

    同时保留启动时从环境变量注册的 OpenRouter/DeepSeek（除非 preserve_env_providers=False）。
    """
    from intelligen_engine.core.providers.registry import get_provider_registry
    from intelligen_engine.core.providers.openai_compatible import OpenAICompatibleProvider
    from intelligen_engine.core.providers.anthropic_provider import AnthropicProvider
    from intelligen_engine.core.providers.google_provider import GoogleProvider
    from intelligen_engine.core.config import settings

    registry = get_provider_registry()

    # 保留 env-var providers（启动时注册的 openrouter/deepseek）
    env_provider_names = {"openrouter", "deepseek"}
    if req.preserve_env_providers:
        kept = {k: v for k, v in registry.list_providers().items() if k in env_provider_names}
    else:
        kept = {}

    # 清空并重注册
    registry._providers = dict(kept)
    registry._stage_config = {}
    registry._fallback_chain = []

    provider_cls_map = {
        "openai_compatible": OpenAICompatibleProvider,
        "anthropic": AnthropicProvider,
        "google": GoogleProvider,
    }

    registered: list[str] = []
    errors: list[str] = []

    for p in req.providers:
        if p.name in kept:
            # 已有同名 env provider，跳过（env 优先）
            continue
        cls = provider_cls_map.get(p.api_format)
        if cls is None:
            errors.append(f"{p.name}: 未知 api_format {p.api_format}")
            continue
        try:
            instance = cls(
                name=p.name,
                base_url=p.base_url,
                api_key=p.api_key,
                timeout=settings.LLM_TIMEOUT,
                auth_required=p.auth_required,
            )
            registry.register(p.name, instance)
            registered.append(p.name)
        except Exception as exc:
            errors.append(f"{p.name}: {exc}")

    # Stage 配置
    for sc in req.stage_configs:
        if sc.provider_name in registry.list_providers():
            registry.set_stage_config(sc.stage, sc.provider_name, sc.model)

    # Fallback 链
    chain: list[tuple[str, str]] = []
    for item in req.fallback_chain:
        if len(item) == 2 and item[0] in registry.list_providers():
            chain.append((item[0], item[1]))
    # 若未提供 fallback_chain，但有 env providers，使用默认
    if not chain and req.preserve_env_providers:
        if "openrouter" in registry.list_providers():
            chain.append(("openrouter", settings.resolved_chat_model))
        if "deepseek" in registry.list_providers():
            chain.append(("deepseek", "deepseek-chat"))
    if chain:
        registry.set_fallback_chain(chain)

    logger.info(
        "[Engine] Providers reloaded: %s (stages=%d, fallback=%d, errors=%d)",
        list(registry.list_providers().keys()),
        len(registry._stage_config),
        len(chain),
        len(errors),
    )

    return {
        "providers": list(registry.list_providers().keys()),
        "registered": registered,
        "stages": dict(registry._stage_config),
        "fallback_chain": [list(x) for x in chain],
        "errors": errors,
    }


# ─── Archive Analysis Routes ───────────────────────────────────


@router.post("/archive/analyze")
async def analyze_archive(file: UploadFile):
    """分析上传的ZIP压缩包"""
    from ..pipeline.context.archive_analyzer import ArchiveAnalyzer

    content = await file.read()
    analyzer = ArchiveAnalyzer()
    try:
        result = analyzer.analyze(content)
        return result.model_dump()
    except ValueError as e:
        raise HTTPException(400, str(e))


# ─── Prompt Management Endpoints ────────────────────────────


class PromptUpdateRequest(BaseModel):
    content: str


class PromptPreviewRequest(BaseModel):
    variables: dict = {}


@router.get("/prompts")
async def list_prompts():
    """列出所有阶段及其提示词内容。"""
    from intelligen_engine.prompts.prompt_manager import PromptManager
    pm = PromptManager.get_instance()
    stages = pm.list_stages()
    result = []
    prompts_dir = Path(pm._dir)
    for stage in sorted(stages):
        yaml_file = prompts_dir / f"{stage}.yaml"
        content = ""
        if yaml_file.exists():
            content = yaml_file.read_text(encoding="utf-8")
        keys = pm.list_keys(stage)
        result.append({"stage": stage, "keys": keys, "content": content})
    return {"stages": result}


@router.get("/prompts/{stage}")
async def get_prompt(stage: str):
    """获取单个阶段的 YAML 提示词内容。"""
    from intelligen_engine.prompts.prompt_manager import PromptManager
    pm = PromptManager.get_instance()
    prompts_dir = Path(pm._dir)
    yaml_file = prompts_dir / f"{stage}.yaml"
    if not yaml_file.exists():
        raise HTTPException(status_code=404, detail=f"阶段 '{stage}' 不存在")
    content = yaml_file.read_text(encoding="utf-8")
    keys = pm.list_keys(stage)
    return {"stage": stage, "keys": keys, "content": content}


@router.put("/prompts/{stage}")
async def update_prompt(stage: str, req: PromptUpdateRequest):
    """更新提示词 YAML 文件内容。"""
    from intelligen_engine.prompts.prompt_manager import PromptManager
    pm = PromptManager.get_instance()
    prompts_dir = Path(pm._dir)
    yaml_file = prompts_dir / f"{stage}.yaml"
    if not yaml_file.exists():
        raise HTTPException(status_code=404, detail=f"阶段 '{stage}' 不存在")
    # 校验 YAML 格式
    try:
        yaml.safe_load(req.content)
    except yaml.YAMLError as e:
        raise HTTPException(status_code=400, detail=f"YAML 格式错误: {e}")
    yaml_file.write_text(req.content, encoding="utf-8")
    pm.reload()
    keys = pm.list_keys(stage)
    return {"stage": stage, "keys": keys, "message": "提示词已更新"}


@router.post("/prompts/{stage}/preview")
async def preview_prompt(stage: str, req: PromptPreviewRequest):
    """预览渲染后的提示词（使用示例变量替换 Jinja2 模板）。"""
    from intelligen_engine.prompts.prompt_manager import PromptManager
    pm = PromptManager.get_instance()
    if stage not in pm.list_stages():
        raise HTTPException(status_code=404, detail=f"阶段 '{stage}' 不存在")
    keys = pm.list_keys(stage)
    rendered = {}
    for key in keys:
        raw = pm.get_raw(stage, key)
        if isinstance(raw, str):
            rendered[key] = pm.render(stage, key, **req.variables)
        else:
            rendered[key] = raw
    return {"stage": stage, "rendered": rendered}


# ─── Section Rewrite (C4) ─────────────────────────────────────

class RewriteSectionRequest(BaseModel):
    feedback: str
    original_content: str
    context: dict = Field(default_factory=dict)


@router.post("/tasks/{task_id}/sections/{section_id}/rewrite")
async def rewrite_section(task_id: str, section_id: str, request: RewriteSectionRequest):
    """局部重写指定章节 — 根据用户反馈调用 LLM 重新生成。"""
    from intelligen_engine.pipeline.writing.section_rewriter import SectionRewriter
    from intelligen_engine.pipeline.shared.llm_service import LLMService

    rewriter = SectionRewriter(LLMService())
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None,
        lambda: rewriter.rewrite(
            original=request.original_content,
            feedback=request.feedback,
            context=request.context,
        ),
    )
    return {
        "task_id": task_id,
        "section_id": section_id,
        "new_content": result["new_content"],
        "diff_text": result["diff_text"],
        "word_count": result["word_count"],
    }
