"""多格式导出转换器 — Markdown → LaTeX / DOCX / PDF

完全解耦的导出管道，将最终 Markdown 转换为多种输出格式。
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import ClassVar

logger = logging.getLogger(__name__)


class BaseConverter(ABC):
    """转换器基类 — 定义统一接口"""

    @abstractmethod
    def convert(self, markdown: str, metadata: dict | None = None) -> bytes:
        """将 Markdown 转换为目标格式的字节流"""
        ...

    @abstractmethod
    def file_extension(self) -> str:
        """返回文件扩展名（不含点号），如 'tex', 'docx', 'pdf'"""
        ...

    @abstractmethod
    def mime_type(self) -> str:
        """返回 MIME 类型"""
        ...


class LaTeXConverter(BaseConverter):
    """Markdown → LaTeX ZIP（ctexart，含 references.bib）"""

    def convert(self, markdown: str, metadata: dict | None = None) -> bytes:
        from .latex_exporter import LaTeXExporter

        meta = metadata or {}
        exporter = LaTeXExporter(
            title=meta.get("title", ""),
            author=meta.get("author", ""),
            date=meta.get("date", ""),
        )
        return exporter.export_zip(
            markdown,
            citations=meta.get("citations"),
            citation_style=meta.get("citation_style", "GB/T 7714"),
            abstract=meta.get("abstract", ""),
            keywords=meta.get("keywords", ""),
        )

    def file_extension(self) -> str:
        return "zip"

    def mime_type(self) -> str:
        return "application/zip"


class DOCXConverter(BaseConverter):
    """Markdown → DOCX（python-docx）"""

    def convert(self, markdown: str, metadata: dict | None = None) -> bytes:
        from .export_service import markdown_to_docx
        return markdown_to_docx(markdown)

    def file_extension(self) -> str:
        return "docx"

    def mime_type(self) -> str:
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


class PDFConverter(BaseConverter):
    """Markdown → PDF（fpdf2，支持中文）"""

    def convert(self, markdown: str, metadata: dict | None = None) -> bytes:
        from .export_service import markdown_to_pdf
        return markdown_to_pdf(markdown)

    def file_extension(self) -> str:
        return "pdf"

    def mime_type(self) -> str:
        return "application/pdf"


class MarkdownConverter(BaseConverter):
    """原始 Markdown 导出（UTF-8 编码）"""

    def convert(self, markdown: str, metadata: dict | None = None) -> bytes:
        return markdown.encode("utf-8")

    def file_extension(self) -> str:
        return "md"

    def mime_type(self) -> str:
        return "text/markdown"


class ExportPipeline:
    """导出管道 — 统一入口，注册所有格式转换器"""

    _converters: ClassVar[dict[str, type[BaseConverter]]] = {
        "latex": LaTeXConverter,
        "docx": DOCXConverter,
        "pdf": PDFConverter,
        "md": MarkdownConverter,
    }

    @classmethod
    def export(
        cls,
        markdown: str,
        fmt: str,
        metadata: dict | None = None,
    ) -> tuple[bytes, str, str]:
        """导出 Markdown 为指定格式。

        Returns:
            (content_bytes, file_extension, mime_type)

        Raises:
            ValueError: 不支持的格式
        """
        converter_cls = cls._converters.get(fmt)
        if converter_cls is None:
            raise ValueError(
                f"不支持的导出格式: {fmt!r}，"
                f"可选: {', '.join(cls._converters)}"
            )

        converter = converter_cls()
        logger.info("导出格式: %s", fmt)
        content = converter.convert(markdown, metadata)
        return content, converter.file_extension(), converter.mime_type()

    @classmethod
    def supported_formats(cls) -> list[str]:
        """返回所有支持的导出格式名称"""
        return list(cls._converters.keys())

    @classmethod
    def register(cls, name: str, converter_cls: type[BaseConverter]) -> None:
        """注册自定义转换器"""
        cls._converters[name] = converter_cls
