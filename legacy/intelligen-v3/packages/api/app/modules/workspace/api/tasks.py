"""Task endpoints: create, list, get status, retry, regenerate section, download."""

from __future__ import annotations

import asyncio
import json
from queue import Empty

from fastapi import APIRouter, Depends, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session as DBSession

from app.platform.exceptions import BusinessException
from app.platform.response import ApiResponse
from app.platform.database import get_db
from app.modules.auth.deps import CurrentUser, require_approved
from app.modules.workspace.models.task import GenerateTask
from app.modules.workspace.schemas.task import (
    CreateTaskRequest, TaskStatusResponse, TaskFileResponse, RegenerateSectionRequest,
    ClarifyCheckRequest, ClarifyCheckResponse, ClarificationQuestionItem,
    ClarifyRefineRequest, ClarifyRefineResponse,
    PreviewOutlineRequest, PreviewOutlineResponse, OutlineSectionPreview,
    ClarifyNextRequest,
    ClarifyAnswerRequest, ClarifySkipRequest,
    ClarifyFinishRequest,
    DocumentExtractRequest,
    RewriteSectionRequest, RewriteSectionResponse,
)
from app.modules.generation.regeneration.generation_bridge import classify_generation_error
from app.modules.workspace.services.session_service import SessionService
from app.modules.workspace.services.task_service import TaskService

router = APIRouter(tags=["tasks"])
TASK_STREAM_HEARTBEAT_SECONDS = 10.0


def _artifact_paths_from_markdown(markdown: str | None) -> dict[str, str]:
    if not markdown:
        return {}

    import re

    label_to_key = {
        "tex": "tex_path",
        "bibtex": "bib_path",
        "docx": "docx_path",
        "pdf": "pdf_path",
        "audit": "audit_path",
        "source bundle": "source_bundle_path",
    }
    artifact_paths: dict[str, str] = {}
    for label, value in re.findall(r"-\s*([^:\n]+):\s*`([^`]+)`", markdown, flags=re.IGNORECASE):
        key = label_to_key.get(label.strip().lower())
        if key and value.strip():
            artifact_paths[key] = value.strip()
    return artifact_paths


def _task_to_dict(task: GenerateTask) -> dict:
    td = TaskStatusResponse.model_validate(task).model_dump()
    meta = TaskService._stage_meta.get(task.taskId, {})
    if meta.get("artifactPaths"):
        td["artifactPaths"] = meta["artifactPaths"]
    elif task.resultMarkdown:
        recovered_artifacts = _artifact_paths_from_markdown(task.resultMarkdown)
        if recovered_artifacts:
            td["artifactPaths"] = recovered_artifacts
            td["executionMode"] = "engine"
    if meta.get("executionMode"):
        td["executionMode"] = meta["executionMode"]
    td["files"] = [TaskFileResponse.model_validate(f).model_dump() for f in task.task_files]
    if task.errorMessage:
        td["errorCategory"] = classify_generation_error(
            task.errorMessage,
            default_message=task.errorMessage,
        ).category
    return td


def _encode_sse_event(payload: dict) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/clarify/check")
async def clarify_check(
    req: ClarifyCheckRequest,
    current_user: CurrentUser = Depends(require_approved),
):
    """Check if user input needs clarification; returns questions if so."""
    from app.modules.generation.clarification import ClarifyService
    svc = ClarifyService()
    result = svc.check_needs_clarification(
        req.userInput,
        has_outline=req.hasOutline,
        has_template=req.hasTemplate,
        has_files=req.hasFiles,
    )
    questions = []
    if result.needs_clarification:
        raw_questions = await svc.generate_questions(
            req.userInput,
            file_names=req.fileNames if hasattr(req, 'fileNames') else None,
            template_name=req.templateName if hasattr(req, 'templateName') else None,
        )
        questions = [
            ClarificationQuestionItem(
                id=q.id, question=q.question, hint=q.hint,
                options=q.options, priority=q.priority, required=q.required,
            )
            for q in raw_questions
        ]
    return ApiResponse.success("ok", ClarifyCheckResponse(
        needsClarification=result.needs_clarification,
        reason=result.reason,
        questions=questions,
    ).model_dump())


@router.get("/paper/stages")
async def paper_stage_contract(current_user: CurrentUser = Depends(require_approved)):
    from app.core.engine_client import engine_client

    await engine_client.refresh_availability()
    if not engine_client.engine_available:
        raise BusinessException(503, "Engine 不可用")
    return ApiResponse.success("获取论文工作流阶段成功", await engine_client.get_paper_stages())


@router.post("/paper/format/resolve")
async def resolve_paper_format(
    payload: dict,
    current_user: CurrentUser = Depends(require_approved),
):
    from app.core.engine_client import engine_client

    await engine_client.refresh_availability()
    if not engine_client.engine_available:
        raise BusinessException(503, "Engine 不可用")
    return ApiResponse.success("格式解析完成", await engine_client.resolve_paper_format(payload))


@router.post("/paper/citations/audit")
async def audit_paper_citations(
    payload: dict,
    current_user: CurrentUser = Depends(require_approved),
):
    from app.core.engine_client import engine_client

    await engine_client.refresh_availability()
    if not engine_client.engine_available:
        raise BusinessException(503, "Engine 不可用")
    return ApiResponse.success("引用审计完成", await engine_client.audit_paper_citations(payload))


@router.post("/paper/interventions/plan")
async def plan_paper_intervention(
    payload: dict,
    current_user: CurrentUser = Depends(require_approved),
):
    from app.core.engine_client import engine_client

    await engine_client.refresh_availability()
    if not engine_client.engine_available:
        raise BusinessException(503, "Engine 不可用")
    return ApiResponse.success("介入计划生成完成", await engine_client.plan_paper_intervention(payload))


async def _proxy_paper_planning(payload: dict, client_method: str, message: str):
    from app.core.engine_client import engine_client

    await engine_client.refresh_availability()
    if not engine_client.engine_available:
        raise BusinessException(503, "Engine 不可用")
    method = getattr(engine_client, client_method)
    return ApiResponse.success(message, await method(payload))


@router.post("/paper/input/route")
async def route_paper_input(
    payload: dict,
    current_user: CurrentUser = Depends(require_approved),
):
    return await _proxy_paper_planning(payload, "route_paper_input", "输入路由完成")


@router.post("/paper/questions/plan")
async def plan_paper_questions(
    payload: dict,
    current_user: CurrentUser = Depends(require_approved),
):
    return await _proxy_paper_planning(payload, "plan_paper_questions", "问题规划完成")


@router.post("/paper/research/plan")
async def plan_paper_research(
    payload: dict,
    current_user: CurrentUser = Depends(require_approved),
):
    return await _proxy_paper_planning(payload, "plan_paper_research", "研究规划完成")


@router.post("/paper/metadata/prefill")
async def prefill_paper_metadata(
    payload: dict,
    current_user: CurrentUser = Depends(require_approved),
):
    return await _proxy_paper_planning(payload, "prefill_paper_metadata", "元信息预填完成")


@router.post("/paper/code/directions")
async def suggest_paper_code_directions(
    payload: dict,
    current_user: CurrentUser = Depends(require_approved),
):
    return await _proxy_paper_planning(payload, "suggest_paper_code_directions", "代码论文方向生成完成")


async def _proxy_paper_endpoint(payload: dict, endpoint: str, message: str):
    from app.core.engine_client import engine_client

    await engine_client.refresh_availability()
    if not engine_client.engine_available:
        raise BusinessException(503, "Engine 不可用")
    return ApiResponse.success(message, await engine_client.post_paper_endpoint(endpoint, payload))


@router.post("/paper/materials/ingest")
async def ingest_paper_materials(payload: dict, current_user: CurrentUser = Depends(require_approved)):
    return await _proxy_paper_endpoint(payload, "materials/ingest", "材料解析完成")


@router.post("/paper/code/browse")
async def browse_paper_code(payload: dict, current_user: CurrentUser = Depends(require_approved)):
    return await _proxy_paper_endpoint(payload, "code/browse", "代码浏览摘要完成")


@router.post("/paper/type/classify")
async def classify_paper_type(payload: dict, current_user: CurrentUser = Depends(require_approved)):
    return await _proxy_paper_endpoint(payload, "type/classify", "论文类型判断完成")


@router.post("/paper/novelty/assess")
async def assess_paper_novelty(payload: dict, current_user: CurrentUser = Depends(require_approved)):
    return await _proxy_paper_endpoint(payload, "novelty/assess", "相似工作检索计划完成")


@router.post("/paper/experiments/plan")
async def plan_paper_experiment(payload: dict, current_user: CurrentUser = Depends(require_approved)):
    return await _proxy_paper_endpoint(payload, "experiments/plan", "实验规划完成")


@router.post("/paper/experiments/adjust")
async def adjust_paper_experiment(payload: dict, current_user: CurrentUser = Depends(require_approved)):
    return await _proxy_paper_endpoint(payload, "experiments/adjust", "实验调整计划完成")


@router.post("/paper/questions/audit")
async def audit_paper_questions(payload: dict, current_user: CurrentUser = Depends(require_approved)):
    return await _proxy_paper_endpoint(payload, "questions/audit", "问题包审计完成")


@router.post("/paper/metadata/audit")
async def audit_paper_metadata(payload: dict, current_user: CurrentUser = Depends(require_approved)):
    return await _proxy_paper_endpoint(payload, "metadata/audit", "元信息审计完成")


@router.post("/paper/figures/audit")
async def audit_paper_figures(payload: dict, current_user: CurrentUser = Depends(require_approved)):
    return await _proxy_paper_endpoint(payload, "figures/audit", "图表审计完成")


@router.post("/clarify/refine")
def clarify_refine(
    req: ClarifyRefineRequest,
    current_user: CurrentUser = Depends(require_approved),
):
    """Merge user input with clarification answers into structured requirement."""
    from app.modules.generation.clarification import ClarifyService
    from app.utils.content_safety import check_content_safety

    # Safety check on combined input + answers
    combined_text = req.userInput + " " + " ".join(
        str(v) for v in req.answers.values() if v
    )
    safety = check_content_safety(combined_text)
    if not safety.is_safe and safety.action == "block":
        raise BusinessException(message="输入内容未通过安全检查，请调整后重试。", code=403)

    svc = ClarifyService()
    refined = svc.refine_requirement(req.userInput, req.answers)
    resp = ClarifyRefineResponse(
        topic=refined.topic,
        requirements=refined.requirements,
        suggestedOutline=refined.suggested_outline,
        targetWords=refined.target_words,
        language=refined.language,
    ).model_dump()

    # Include safety warning for "review" level
    if safety.action == "review":
        resp["safetyWarning"] = safety.message

    return ApiResponse.success("ok", resp)


@router.post("/clarify/preview-outline")
async def preview_outline(
    req: PreviewOutlineRequest,
    current_user: CurrentUser = Depends(require_approved),
):
    """Generate outline preview for user review before generation."""
    from app.modules.generation.planning.outline_planner import OutlinePlanner
    from app.modules.generation.shared.llm_service import LLMService

    llm = LLMService()
    planner = OutlinePlanner(llm)
    outline = await asyncio.to_thread(
        planner.plan, req.userInput, requirement=req.requirement or "",
    )

    sections = [
        OutlineSectionPreview(
            title=s.title,
            description=s.instruction,
            targetWords=s.target_words,
        )
        for s in outline.sections
    ]
    return ApiResponse.success("ok", PreviewOutlineResponse(sections=sections).model_dump())


@router.post("/sessions/{session_id}/tasks")
def create_task(
    session_id: str,
    req: CreateTaskRequest,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    SessionService.verify_ownership(session_id, current_user.user_id, db)
    task = TaskService.create_task(session_id, current_user.user_id, req, db)
    return ApiResponse.success("任务创建成功", _task_to_dict(task))


@router.get("/sessions/{session_id}/tasks")
def list_tasks(
    session_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    SessionService.verify_ownership(session_id, current_user.user_id, db)
    tasks = TaskService.list_tasks(session_id, db)
    data = [_task_to_dict(t) for t in tasks]
    return ApiResponse.success("获取任务列表成功", data)


@router.get("/tasks")
def list_user_tasks(
    status: str | None = Query(None, pattern=r"^[a-z_,]+$"),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    """列出当前用户所有任务，支持分页和状态过滤"""
    tasks, total = TaskService.list_user_tasks(
        current_user.user_id, db, status=status, page=page, per_page=per_page,
    )
    return ApiResponse.success("获取任务列表成功", {
        "items": [_task_to_dict(t) for t in tasks],
        "total": total,
        "page": page,
        "perPage": per_page,
    })


@router.get("/tasks/{task_id}")
def get_task_status(
    task_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    task = TaskService.get_task(task_id, current_user.user_id, db)
    return ApiResponse.success("获取任务状态成功", _task_to_dict(task))


@router.get("/tasks/{task_id}/stream")
async def stream_task_progress(
    task_id: str,
    request: Request,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    task = TaskService.get_task(task_id, current_user.user_id, db)
    subscription = TaskService.subscribe_task_progress(task_id)
    db.refresh(task)
    initial_event = TaskService.build_progress_event(task)

    async def event_stream():
        try:
            yield _encode_sse_event(initial_event)

            if TaskService.is_terminal_status(initial_event.get("status")):
                return

            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.to_thread(
                        subscription.get,
                        True,
                        TASK_STREAM_HEARTBEAT_SECONDS,
                    )
                except Empty:
                    yield ": keep-alive\n\n"
                    continue

                yield _encode_sse_event(event)

                if TaskService.is_terminal_status(event.get("status")):
                    break
        finally:
            TaskService.unsubscribe_task_progress(task_id, subscription)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/tasks/{task_id}/retry")
def retry_task(
    task_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    task = TaskService.retry_task(task_id, current_user.user_id, db)
    return ApiResponse.success("任务已重新提交", _task_to_dict(task))


@router.post("/tasks/{task_id}/cancel")
def cancel_task(
    task_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    task = TaskService.cancel_task(task_id, current_user.user_id, db)
    return ApiResponse.success("任务已取消", _task_to_dict(task))


@router.post("/tasks/{task_id}/sections/{section_index}/regenerate")
def regenerate_section(
    task_id: str,
    section_index: int,
    req: RegenerateSectionRequest = None,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    task = TaskService.get_task(task_id, current_user.user_id, db)
    if task.status != "completed":
        raise BusinessException(400, "只有已完成的任务才能重生成章节")
    if not task.resultMarkdown:
        raise BusinessException(400, "没有可用的生成结果")

    try:
        from app.modules.generation.regeneration.generation_bridge import regenerate_section as regen

        result = regen(
            task_id=task_id,
            section_index=section_index,
            full_markdown=task.resultMarkdown,
            custom_prompt=req.customPrompt if req else None,
        )
        task.resultMarkdown = result["full_markdown"]
        db.commit()
        return ApiResponse.success("章节重生成成功", result)
    except ValueError as e:
        raise BusinessException(400, "章节索引超出范围") from e


@router.post("/tasks/{task_id}/sections/{section_id}/rewrite")
async def rewrite_section(
    task_id: str,
    section_id: str,
    req: RewriteSectionRequest,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    """局部重写指定章节 — 根据用户反馈调用引擎 LLM 重新生成"""
    task = TaskService.get_task(task_id, current_user.user_id, db)
    if task.status != "completed":
        raise BusinessException(400, "只有已完成的任务才能重写章节")

    from app.core.engine_client import engine_client

    await engine_client.refresh_availability()
    if not engine_client.engine_available:
        raise BusinessException(503, "引擎服务不可用，请稍后重试")

    result = await engine_client.rewrite_section(
        task_id=task_id,
        section_id=section_id,
        feedback=req.feedback,
        original_content=req.originalContent,
        context=req.context,
    )
    return ApiResponse.success("章节重写成功", RewriteSectionResponse(
        newContent=result.get("new_content", ""),
        diffText=result.get("diff_text", ""),
        wordCount=result.get("word_count", 0),
    ).model_dump())


# ═══════════════════════════════════════════════════════════════
# Progressive Clarification (proxy to Engine)
# ═══════════════════════════════════════════════════════════════

async def _engine_clarify_proxy(method: str, payload: dict) -> dict:
    """Forward a progressive-clarification request to the Engine."""
    from app.core.engine_client import engine_client

    await engine_client.refresh_availability()
    if not engine_client.engine_available:
        raise BusinessException(503, "引擎服务不可用，请稍后重试")

    fn = getattr(engine_client, method, None)
    if fn is None:
        raise BusinessException(500, f"未知引擎方法: {method}")
    return await fn(**payload)


@router.post("/sessions/{session_id}/tasks/clarify/next")
async def clarify_next_question(
    session_id: str,
    req: ClarifyNextRequest,
    user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    """Get the next progressive clarification question from the engine."""
    import logging as _log
    _logger = _log.getLogger("clarify_debug")
    try:
        SessionService.verify_ownership(session_id, user.user_id, db)
        _logger.error("Session ownership check passed for %s", session_id)

        task_id = f"clarify-{session_id}"
        result = await _engine_clarify_proxy("clarify_next", {
            "task_id": task_id,
            "topic": req.topic,
            "history": req.history,
            "document_info": req.documentInfo,
        })
        _logger.error("Engine result: %s", str(result)[:200])
        return ApiResponse.success("获取下一个问题", result)
    except Exception as e:
        _logger.error("CLARIFY ERROR: %s: %s", type(e).__name__, e, exc_info=True)
        raise


@router.post("/sessions/{session_id}/tasks/clarify/answer")
async def clarify_submit_answer(
    session_id: str,
    req: ClarifyAnswerRequest,
    user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    """Submit an answer and get the next question."""
    SessionService.verify_ownership(session_id, user.user_id, db)

    task_id = f"clarify-{session_id}"
    result = await _engine_clarify_proxy("clarify_answer", {
        "task_id": task_id,
        "topic": req.topic,
        "answer": req.answer,
        "history": req.history,
        "document_info": req.documentInfo,
    })
    return ApiResponse.success("提交回答成功", result)


@router.post("/sessions/{session_id}/tasks/clarify/skip")
async def clarify_skip_question(
    session_id: str,
    req: ClarifySkipRequest,
    user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    """Skip the current question and get the next one."""
    SessionService.verify_ownership(session_id, user.user_id, db)

    task_id = f"clarify-{session_id}"
    result = await _engine_clarify_proxy("clarify_skip", {
        "task_id": task_id,
        "topic": req.topic,
        "history": req.history,
        "document_info": req.documentInfo,
    })
    return ApiResponse.success("已跳过当前问题", result)


@router.post("/sessions/{session_id}/tasks/clarify/finish")
async def clarify_finish(
    session_id: str,
    req: ClarifyFinishRequest,
    user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    """Finish clarification early and get summary."""
    SessionService.verify_ownership(session_id, user.user_id, db)

    task_id = f"clarify-{session_id}"
    result = await _engine_clarify_proxy("clarify_finish", {
        "task_id": task_id,
        "topic": req.topic,
        "history": req.history,
        "document_info": req.documentInfo,
    })
    return ApiResponse.success("澄清完成", result)


@router.post("/sessions/{session_id}/tasks/clarify/extract-doc")
async def clarify_extract_document(
    session_id: str,
    req: DocumentExtractRequest,
    user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    """Extract key info from an uploaded document."""
    SessionService.verify_ownership(session_id, user.user_id, db)

    task_id = f"clarify-{session_id}"
    result = await _engine_clarify_proxy("extract_document_info", {
        "task_id": task_id,
        "text_excerpt": req.textExcerpt,
        "file_name": req.fileName,
    })
    return ApiResponse.success("文档信息提取完成", result)


@router.get("/sessions/{session_id}/tasks/active")
async def get_active_task(
    session_id: str,
    user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    """Get the currently active (non-terminal) task for a session, if any."""
    SessionService.verify_ownership(session_id, user.user_id, db)

    active_statuses = ("pending", "running", "generating", "reviewing", "exporting")
    task = (
        db.query(GenerateTask)
        .filter(
            GenerateTask.sessionId == session_id,
            GenerateTask.status.in_(active_statuses),
        )
        .order_by(GenerateTask.createdAt.desc())
        .first()
    )
    if not task:
        return ApiResponse.success("没有正在进行的任务", None)

    return ApiResponse.success("获取活跃任务成功", _task_to_dict(task))


# ═══════════════════════════════════════════════════════════════
# Archive Analysis (proxy to Engine)
# ═══════════════════════════════════════════════════════════════

@router.post("/tasks/archive/analyze")
async def analyze_archive(
    file: UploadFile,
    current_user: CurrentUser = Depends(require_approved),
):
    """上传并分析项目资料压缩包"""
    from app.core.engine_client import engine_client

    if not file.filename or not file.filename.lower().endswith('.zip'):
        raise BusinessException(400, "仅支持ZIP格式文件")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise BusinessException(400, "文件大小不能超过50MB")

    await engine_client.refresh_availability()
    if not engine_client.engine_available:
        raise BusinessException(503, "引擎服务不可用，请稍后重试")

    try:
        result = await engine_client.analyze_archive(content, file.filename)
        return ApiResponse.success("压缩包分析完成", result)
    except Exception as e:
        raise BusinessException(500, f"分析失败: {str(e)}")


@router.get("/tasks/{task_id}/download")
async def download_report(
    task_id: str,
    format: str = Query("md", pattern="^(md|docx|pdf|latex|tex|bib|bibtex|audit|source|bundle|source_bundle)$"),
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    task = TaskService.get_task(task_id, current_user.user_id, db)
    if format in {"docx", "tex", "bib", "bibtex", "audit", "pdf", "source", "bundle", "source_bundle"}:
        try:
            from app.core.engine_client import engine_client

            await engine_client.refresh_availability()
            if engine_client.engine_available:
                content, media_type, content_disposition = await engine_client.export_task(
                    task_id,
                    format,
                )
                filename = f"report-{task_id[:8]}.{format}"
                headers = {
                    "Content-Disposition": content_disposition
                    or f'attachment; filename="{filename}"'
                }
                from io import BytesIO

                return StreamingResponse(
                    BytesIO(content),
                    media_type=media_type,
                    headers=headers,
                )
        except Exception:
            if format in {"tex", "bib", "bibtex", "audit", "source", "bundle", "source_bundle"}:
                raise BusinessException(404, "Engine 论文产物不可用")

    if not task.resultMarkdown:
        raise BusinessException(400, "没有可下载的报告")

    if format == "md":
        content = task.resultMarkdown.encode("utf-8")
        media_type = "text/markdown"
        filename = f"report-{task_id[:8]}.md"
    elif format in ("docx", "pdf", "latex"):
        from app.modules.generation.export.format_converter import ExportPipeline
        content, ext, media_type = ExportPipeline.export(task.resultMarkdown, format)
        filename = f"report-{task_id[:8]}.{ext}"
    else:
        raise BusinessException(400, f"不支持的格式: {format}")

    from io import BytesIO
    return StreamingResponse(
        BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
