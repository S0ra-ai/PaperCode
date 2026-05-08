"""FastAPI 任务系统与生成引擎之间的桥接层。"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional

from app.platform.config import settings
from app.modules.generation.regeneration.regeneration_context import (
    build_grounded_regeneration_prompt,
    build_regeneration_context,
    ensure_section_heading,
    split_markdown_sections,
)
from app.utils.content_safety import check_content_safety

logger = logging.getLogger(__name__)

_pipeline = None


@dataclass(frozen=True)
class GenerationErrorInfo:
    category: str
    message: str


class GenerationError(RuntimeError):
    """对外暴露给任务和 API 层的标准化生成错误。"""

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
            from app.modules.generation.writing.report_pipeline import ReportPipeline
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
    """执行完整的报告生成流水线。

    Args:
        task_id: 唯一任务标识。
        user_input: 用户的主题/需求文本。
        outline: 可选的用户提供大纲。
        template_content: 可选的模板内容（已读取）。
        user_file_paths: 用于 RAG 索引的本地文件路径。
        requirement: 可选的细化需求文本。
        citation_style: 参考文献格式（"apa"、"mla"、"chicago"、"gb"）。
        progress_callback: 进度回调，签名为 (当前章节, 总章节数)。
        checkpoint_callback: 每章节完成时的持久化回调。
        existing_checkpoints: 用于断点续写的已有检查点。

    Returns:
        生成的 Markdown 字符串。

    Raises:
        RuntimeError: 流水线不可用或内容被拦截时抛出。
    """
    # 内容安全检查
    safety = check_content_safety(user_input)
    if not safety.is_safe and safety.action == "block":
        raise GenerationError("content_safety_blocked", "请求内容未通过安全校验，请调整后重试。")
    if safety.action == "review":
        logger.warning(f"Task {task_id}: content flagged for review — {safety.message}")

    pipeline = get_pipeline()
    if pipeline is None:
        raise GenerationError("engine_unavailable", "生成引擎暂时不可用，请稍后重试。")

    # 用户上传文件时构建本地 RAG
    local_rag = None
    index_service = None
    indexed_doc_ids = None
    if user_file_paths:
        try:
            from app.modules.generation.retrieval.index_service import IndexService
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

        # 回退方案：IndexService 失败时使用旧版 LocalDocManager
        if index_service is None:
            try:
                from app.modules.generation.retrieval.local_doc_service import LocalDocManager
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

    # 调用流水线（返回 dict 而非字符串）
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
    """重新生成已有报告的单个章节。

    按标题拆分 Markdown，重新生成目标章节后返回更新后的完整文本。
    """
    pipeline = get_pipeline()
    if pipeline is None:
        raise GenerationError("engine_unavailable", "生成引擎暂时不可用，请稍后重试。")

    # 按标题拆分 Markdown
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
    """按顶级标题（# ...）拆分 Markdown 为章节列表。"""
    return split_markdown_sections(markdown)
