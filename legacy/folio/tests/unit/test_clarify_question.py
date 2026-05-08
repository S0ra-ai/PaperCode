# SPDX-License-Identifier: MPL-2.0
"""Tests for the LLM-driven question generator (fallback path)."""

from __future__ import annotations

import asyncio

from app.core.clarify.question import FALLBACK_QUESTIONS, generate
from app.providers.registry import ProviderRegistry


def test_generate_falls_back_with_no_registry() -> None:
    g = asyncio.run(generate(field="topic", known={}, registry=None))
    assert g.source == "fallback"
    assert g.field == "topic"
    assert g.question == FALLBACK_QUESTIONS["topic"][0]


def test_generate_falls_back_with_empty_registry() -> None:
    reg = ProviderRegistry()
    # `author` is not schema-driven; with an empty registry it falls back.
    g = asyncio.run(generate(field="author", known={}, registry=reg))
    assert g.source == "fallback"
    assert g.expected_type == "string"


def test_generate_venue_uses_schema_with_options() -> None:
    g = asyncio.run(generate(field="venue", known={}, registry=None))
    assert g.source == "schema"
    assert g.options  # populated
    values = [o.value for o in g.options]
    assert "IEEE" in values and "ACM" in values
    assert g.allow_other is True


def test_generate_unknown_field_uses_default_template() -> None:
    g = asyncio.run(generate(field="weird_unseen_field", known={}, registry=None))
    assert g.source == "fallback"
    assert "weird_unseen_field" in g.question
