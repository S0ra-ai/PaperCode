# SPDX-License-Identifier: MPL-2.0
"""Clarify package — entropy-based stop + LLM-driven question generation."""

from app.core.clarify.entropy import (
    ANSWERED_CONFIDENCE,
    DEFAULT_TAU_C,
    DEFAULT_TAU_E,
    DEFAULT_TAU_F,
    PROFILE_CONFIDENCE,
    StopDecision,
    evaluate,
    next_field,
)
from app.core.clarify.question import GeneratedQuestion, generate

__all__ = [
    "ANSWERED_CONFIDENCE",
    "DEFAULT_TAU_C",
    "DEFAULT_TAU_E",
    "DEFAULT_TAU_F",
    "PROFILE_CONFIDENCE",
    "GeneratedQuestion",
    "StopDecision",
    "evaluate",
    "generate",
    "next_field",
]
