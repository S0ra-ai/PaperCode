# SPDX-License-Identifier: MPL-2.0
"""Unit tests for `app.tools.pdf_ingest`.

Cover the OCR fallback path with monkey-patched `pdfplumber` (so the
test never touches the disk) and a fake `pytesseract` / `pdf2image`
module pair injected via `sys.modules`. Also cover the graceful
no-OCR path when those modules are unavailable.
"""

from __future__ import annotations

import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from app.tools import pdf_ingest


class _FakePdfPage:
    def __init__(self, text: str) -> None:
        self._text = text

    def extract_text(self) -> str:
        return self._text


class _FakePdf:
    def __init__(self, page_texts: list[str]) -> None:
        self.pages = [_FakePdfPage(t) for t in page_texts]

    def __enter__(self) -> _FakePdf:
        return self

    def __exit__(self, *args: object) -> None:
        return None


def _patch_pdfplumber(monkeypatch: pytest.MonkeyPatch, page_texts: list[str]) -> None:
    monkeypatch.setattr(
        pdf_ingest.pdfplumber,
        "open",
        lambda _p: _FakePdf(page_texts),
    )


def test_extract_returns_pdfplumber_text_when_present(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _patch_pdfplumber(monkeypatch, ["hello world", "second page"])
    p = tmp_path / "x.pdf"
    p.write_bytes(b"%PDF stub")  # content irrelevant; pdfplumber is mocked

    result = pdf_ingest.extract(p)

    assert result.used_ocr is False
    assert result.pages == ("hello world", "second page")
    assert "hello world" in result.text


def test_extract_falls_back_to_ocr_on_empty_text(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _patch_pdfplumber(monkeypatch, ["", "   "])  # pdfplumber returns nothing

    fake_pytesseract = types.ModuleType("pytesseract")
    fake_pytesseract.image_to_string = MagicMock(  # type: ignore[attr-defined]
        side_effect=["scanned page 1", "scanned page 2"]
    )
    fake_pdf2image = types.ModuleType("pdf2image")
    fake_pdf2image.convert_from_path = MagicMock(  # type: ignore[attr-defined]
        return_value=["IMG1", "IMG2"]
    )
    monkeypatch.setitem(sys.modules, "pytesseract", fake_pytesseract)
    monkeypatch.setitem(sys.modules, "pdf2image", fake_pdf2image)

    p = tmp_path / "scan.pdf"
    p.write_bytes(b"%PDF stub")

    result = pdf_ingest.extract(p)

    assert result.used_ocr is True
    assert result.pages == ("scanned page 1", "scanned page 2")
    fake_pdf2image.convert_from_path.assert_called_once_with(str(p))
    assert fake_pytesseract.image_to_string.call_count == 2


def test_extract_returns_empty_when_ocr_modules_unavailable(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _patch_pdfplumber(monkeypatch, ["", ""])

    # Force ImportError on both OCR modules.
    real_import = (
        __builtins__["__import__"]
        if isinstance(__builtins__, dict)
        else __builtins__.__import__
    )  # type: ignore[index, union-attr]

    def _blocking_import(
        name: str,
        globals: object = None,
        locals: object = None,
        fromlist: tuple[str, ...] = (),
        level: int = 0,
    ) -> object:
        if name in {"pytesseract", "pdf2image"}:
            raise ImportError(f"{name} not installed (test stub)")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr("builtins.__import__", _blocking_import)

    p = tmp_path / "scan.pdf"
    p.write_bytes(b"%PDF stub")

    result = pdf_ingest.extract(p)

    # pdfplumber returned empty, OCR fallback failed → empty result, no OCR flag.
    assert result.used_ocr is False
    assert result.pages == ("", "")
    assert bool(result) is False
