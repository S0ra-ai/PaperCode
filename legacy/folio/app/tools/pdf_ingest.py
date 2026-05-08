# SPDX-License-Identifier: MPL-2.0
"""PDF text ingest.

Primary path: ``pdfplumber``. Fallback path: ``pytesseract`` OCR over
``pdf2image`` page renders for scanned/image-only PDFs. The fallback
is invoked automatically when ``pdfplumber`` returns no usable text
on any page; if either OCR dep is missing, we degrade gracefully to
an empty-text result so callers can decide what to do (typically the
FormatStage will surface a "could not extract format" error).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

import pdfplumber


@dataclass(frozen=True)
class PdfText:
    path: Path
    pages: tuple[str, ...]
    used_ocr: bool = False

    @property
    def text(self) -> str:
        return "\n\n".join(self.pages)

    def __bool__(self) -> bool:
        return any(p.strip() for p in self.pages)


@dataclass(frozen=True)
class PdfStructure:
    """Lightweight structural fingerprint used by `FormatStage`."""

    page_count: int
    first_page_text: str
    font_histogram: dict[float, int] = field(default_factory=dict)
    columns_hint: int = 1


def _ocr_fallback(path: Path) -> tuple[str, ...]:
    # Lazy import: a missing tesseract binary or pytesseract module
    # must not break pdfplumber's happy path on a dev box without OCR.
    try:
        import pytesseract  # type: ignore[import-not-found]
        from pdf2image import convert_from_path  # type: ignore[import-not-found]
    except ImportError:
        return ()
    pages: list[str] = []
    for image in convert_from_path(str(path)):
        pages.append(pytesseract.image_to_string(image))
    return tuple(pages)


def extract(path: str | Path) -> PdfText:
    """Extract text from `path`; falls back to OCR if pdfplumber returns empty."""
    p = Path(path)
    pages: list[str] = []
    with pdfplumber.open(p) as pdf:
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    if not any(s.strip() for s in pages):
        ocr_pages = _ocr_fallback(p)
        if ocr_pages:
            return PdfText(path=p, pages=ocr_pages, used_ocr=True)
    return PdfText(path=p, pages=tuple(pages))


def _columns_hint(words: list[dict]) -> int:
    if len(words) < 50:
        return 1
    xs = [float(w.get("x0", 0)) for w in words]
    xs.sort()
    median = xs[len(xs) // 2]
    left = sum(1 for x in xs if x < median)
    right = len(xs) - left
    # Two columns if both halves carry comparable mass and the median
    # sits roughly mid-page.
    return 2 if 0.4 <= left / len(xs) <= 0.6 and right > 20 else 1


def extract_structure(path: str | Path) -> PdfStructure:
    """Cheap structural probe used as input to `FormatStage`."""
    p = Path(path)
    histogram: Counter[float] = Counter()
    first_text = ""
    columns = 1
    with pdfplumber.open(p) as pdf:
        page_count = len(pdf.pages)
        for i, page in enumerate(pdf.pages):
            for ch in page.chars:
                size = round(float(ch.get("size", 0.0)), 1)
                if size:
                    histogram[size] += 1
            if i == 0:
                first_text = page.extract_text() or ""
                columns = _columns_hint(page.extract_words() or [])
    return PdfStructure(
        page_count=page_count,
        first_page_text=first_text,
        font_histogram=dict(histogram.most_common(8)),
        columns_hint=columns,
    )
