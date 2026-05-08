"""Bridge between the FastAPI task system and the generation engine.

Adapts the ReportPipeline's interface (topic, outline, template, requirement,
progress_callback(current, total), checkpoint_callback) to the task system's
interface (task_id, userInput, outline, template/files, 2-arg progress).
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional

from intelligen_engine.core.config import settings
from intelligen_engine.pipeline.regeneration.regeneration_context import (
    build_grounded_regeneration_prompt,
    build_regeneration_context,
    ensure_section_heading,
    split_markdown_sections,
)
from intelligen_engine.pipeline.shared.content_safety import check_content_safety

logger = logging.getLogger(__name__)

_pipeline = None


@dataclass(frozen=True)
class GenerationErrorInfo:
    category: str
    message: str


class GenerationError(RuntimeError):
    """Sanitized generation error exposed to task and API layers."""

    def __init__(self, category: str, message: str) -> None:
        super().__init__(message)
        self.category = category
        self.safe_message = message


_ERROR_RULES = (
    (
        "quota_exceeded",
        (
            "模型额度不足",
            "额度不足",
            "额度已用尽",
            "quota",
            "credits",
            "credit balance",
            "insufficient credit",
            "insufficient balance",
            "payment required",
        ),
        "生成额度已用尽，请稍后重试或联系管理员。",
    ),
    (
        "content_safety_blocked",
        (
            "内容安全检查未通过",
            "未通过安全校验",
            "content safety",
            "content policy",
            "safety system",
            "moderation",
        ),
        "请求内容未通过安全校验，请调整后重试。",
    ),
    (
        "rag_index_error",
        (
            "build index",
            "无法建立索引",
            "local rag",
            "embedding",
            "vector store",
            "vectorstore",
            "faiss",
            "建立索引",
            "文件不存在",
            "no such file",
            "permission denied",
        ),
        "上传文件暂时无法建立索引，请检查文件后重试。",
    ),
    (
        "engine_unavailable",
        (
            "生成引擎尚未就绪",
            "暂时不可用",
            "timeout",
            "timed out",
            "connection refused",
            "connection reset",
            "service unavailable",
            "bad gateway",
            "gateway timeout",
            "openrouter",
        ),
        "生成引擎暂时不可用，请稍后重试。",
    ),
)


def classify_generation_error(
    error: Exception | str, *,
    default_message: str = "报告生成失败，请稍后重试。",
) -> GenerationErrorInfo:
    if isinstance(error, GenerationError):
        return GenerationErrorInfo(error.category, error.safe_message)

    raw_message = str(error or "").strip()
    lowered = raw_message.lower()

    for category, keywords, safe_message in _ERROR_RULES:
        if any(keyword in raw_message or keyword in lowered for keyword in keywords):
            return GenerationErrorInfo(category=category, message=safe_message)

    return GenerationErrorInfo(category="generation_failed", message=default_message)


def to_generation_error(
    error: Exception | str, *,
    default_message: str = "报告生成失败，请稍后重试。",
) -> GenerationError:
    if isinstance(error, GenerationError):
        return error
    info = classify_generation_error(error, default_message=default_message)
    return GenerationError(info.category, info.message)


def build_error_payload(
    error: Exception | str, *,
    default_message: str = "报告生成失败，请稍后重试。",
) -> dict:
    info = classify_generation_error(error, default_message=default_message)
    return {
        "status": "error",
        "message": info.message,
        "errorCategory": info.category,
    }


def get_pipeline():
    global _pipeline
    if _pipeline is None:
        try:
            from intelligen_engine.pipeline.writing.report_pipeline import ReportPipeline
            _pipeline = ReportPipeline()
            logger.info("ReportPipeline initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize ReportPipeline: {e}")
            _pipeline = None
    return _pipeline


def run_report_generation(
    task_id: str,
    user_input: str,
    outline: str | None = None,
    template_content: str | None = None,
    user_file_paths: list[str] | None = None,
    requirement: str | None = None,
    citation_style: str = "gb",
    progress_callback: Callable[..., None] | None = None,
    checkpoint_callback: Callable | None = None,
    existing_checkpoints: list[dict] | None = None,
    content_callback: Callable | None = None,
    target_word_count: int | None = None,
) -> str:
    """Run the full report generation pipeline.

    Args:
        task_id: Unique task identifier.
        user_input: User's topic/requirement text.
        outline: Optional user-provided outline text.
        template_content: Optional template file content (already read).
        user_file_paths: Local file paths for RAG indexing.
        requirement: Optional refined requirement text.
        citation_style: Reference format style ("apa", "mla", "chicago", "gb").
        progress_callback: Called as progress_callback(current_section, total_sections).
        checkpoint_callback: Called per-section for persistence.
        existing_checkpoints: Checkpoints from previous run for resume.

    Returns:
        Generated markdown string.

    Raises:
        RuntimeError: If pipeline unavailable or content blocked.
    """
    # Content safety check
    safety = check_content_safety(user_input)
    if not safety.is_safe and safety.action == "block":
        raise GenerationError("content_safety_blocked", "请求内容未通过安全校验，请调整后重试。")
    if safety.action == "review":
        logger.warning(f"Task {task_id}: content flagged for review — {safety.message}")

    pipeline = get_pipeline()
    if pipeline is None:
        raise GenerationError("engine_unavailable", "生成引擎暂时不可用，请稍后重试。")

    # Build local RAG if user uploaded files
    local_rag = None
    index_service = None
    indexed_doc_ids = None
    if user_file_paths:
        try:
            from intelligen_engine.pipeline.retrieval.index_service import IndexService
            index_service = IndexService()
            if index_service.available:
                indexed_doc_ids = index_service.index_documents(user_file_paths)
                if not indexed_doc_ids:
                    logger.warning(f"No files could be indexed for task {task_id}")
                    index_service = None
            else:
                index_service = None
        except Exception as e:
            logger.warning(f"IndexService unavailable for task {task_id}: {e}, trying legacy mode")
            index_service = None

        # Legacy fallback: use old LocalDocManager if IndexService failed
        if index_service is None:
            try:
                from intelligen_engine.pipeline.retrieval.local_doc_service import LocalDocManager
                local_rag = LocalDocManager()
                if local_rag.embeddings:
                    indexed = local_rag.build_index(uploaded_files=user_file_paths)
                    if not indexed:
                        logger.warning(f"No files indexed (legacy) for task {task_id}")
                        local_rag = None
                else:
                    local_rag = None
            except Exception as e:
                logger.warning(f"Legacy RAG also failed for task {task_id}: {e}")
                local_rag = None

    # Call pipeline — it returns a dict, not a string
    try:
        result = pipeline.generate(
            topic=user_input,
            local_rag=local_rag,
            index_service=index_service,
            doc_ids=indexed_doc_ids,
            template=template_content or "",
            outline=outline or "",
            requirement=requirement or "",
            citation_style=citation_style,
            progress_callback=progress_callback,
            checkpoint_callback=checkpoint_callback,
            existing_checkpoints=existing_checkpoints,
            content_callback=content_callback,
            target_word_count=target_word_count,
        )
    except Exception as exc:
        raise to_generation_error(exc) from exc

    if result.get("status") == "error":
        raise GenerationError(
            result.get("errorCategory", "generation_failed"),
            result.get("message", "报告生成失败，请稍后重试。"),
        )

    return result.get("content", "")


def regenerate_section(
    task_id: str,
    section_index: int,
    full_markdown: str,
    custom_prompt: str | None = None,
) -> dict:
    """Regenerate a single section of an existing report.

    Splits the markdown by section headings, regenerates the target section,
    and returns the updated full markdown.
    """
    pipeline = get_pipeline()
    if pipeline is None:
        raise GenerationError("engine_unavailable", "生成引擎暂时不可用，请稍后重试。")

    # Split markdown into sections by heading
    sections = split_markdown_sections(full_markdown)
    if section_index < 0 or section_index >= len(sections):
        raise ValueError("章节索引超出范围")

    context = build_regeneration_context(sections, section_index)

    from langchain_core.messages import SystemMessage, HumanMessage

    prompt_text = build_grounded_regeneration_prompt(context, custom_prompt)
    messages = [
        SystemMessage(
            content=(
                "You are an expert academic writer revising one section of an existing report. "
                "Stay grounded in the supplied report evidence and do not invent citations."
            )
        ),
        HumanMessage(content=prompt_text),
    ]

    try:
        result = pipeline.llm.chat_routed(
            messages,
            task_type="writing",
            routing_metadata={"section_index": section_index},
        )
    except Exception as exc:
        raise to_generation_error(
            exc,
            default_message="章节重生成失败，请稍后重试。",
        ) from exc
    new_content = result.get("content", "").strip()

    new_content = ensure_section_heading(new_content, context.section_heading)

    sections[section_index] = new_content
    updated_markdown = "\n\n".join(sections)

    return {
        "section_index": section_index,
        "section_content": new_content,
        "full_markdown": updated_markdown,
    }


def _split_markdown_sections(markdown: str) -> list[str]:
    """Split markdown into sections by top-level headings (# ...)."""
    return split_markdown_sections(markdown)
