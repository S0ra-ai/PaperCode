# SPDX-License-Identifier: MPL-2.0
"""PDF ingest smoke test.

Skipped automatically when no fixture PDF is present. Drop any
`*.pdf` into `tests/fixtures/` to enable. A real IEEE sample will be
added during M1 (`m1-pdf-ingest`).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.tools.pdf_ingest import extract

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures"


def _first_pdf() -> Path | None:
    pdfs = sorted(FIXTURE_DIR.glob("*.pdf"))
    return pdfs[0] if pdfs else None


@pytest.mark.skipif(_first_pdf() is None, reason="no PDF fixture present yet")
def test_pdfplumber_extracts_text() -> None:
    pdf = _first_pdf()
    assert pdf is not None
    result = extract(pdf)
    assert bool(result), "expected non-empty text from pdfplumber"
    assert len(result.text.strip()) > 100
