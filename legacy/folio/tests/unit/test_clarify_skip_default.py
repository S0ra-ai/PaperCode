# SPDX-License-Identifier: MPL-2.0
"""Verify every schema-driven question ends with a 'skip default' option."""

from __future__ import annotations

import asyncio

from app.core.clarify.question import FIELD_SCHEMAS, generate


def test_every_schema_question_has_skip_default() -> None:
    for field in FIELD_SCHEMAS:
        g = asyncio.run(generate(field=field, known={}, registry=None))
        assert g.source == "schema", field
        assert g.options, field
        last = g.options[-1]
        assert last.value == "", f"{field}: last option must be skip sentinel"
        assert "跳过" in last.label, field
