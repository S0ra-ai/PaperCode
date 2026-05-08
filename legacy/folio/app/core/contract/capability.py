# SPDX-License-Identifier: MPL-2.0
"""Capability — what an LLM endpoint can do, used by SAMA routing.

Populated at startup by `m2-provider-probe` and stored in
`~/.folio/providers.cache.json`. Consumed by the Stage-Aware Model
Assignment scorer.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class CapFlag(StrEnum):
    CHAT = "chat"
    STREAM = "stream"
    TOOLS = "tools"
    EMBEDDINGS = "embeddings"
    JSON_SCHEMA = "json_schema"
    VISION = "vision"


class Capability(BaseModel):
    """Probed capability profile of one configured endpoint."""

    label: str
    base_url: str
    default_model: str
    available_models: tuple[str, ...] = ()
    flags: frozenset[CapFlag] = Field(default_factory=frozenset)
    context_window: int | None = None
    probed_at: datetime | None = None
    last_error: str | None = None

    model_config = {"frozen": True}

    def supports(self, flag: CapFlag) -> bool:
        return flag in self.flags
