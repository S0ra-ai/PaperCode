# SPDX-License-Identifier: MPL-2.0
"""Prompt loader tests."""

from __future__ import annotations

from app.core.prompts import render


def test_base_template_renders() -> None:
    out = render("_base.j2", language="中文")
    assert "Folio" in out
    assert "中文" in out
