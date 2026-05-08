# SPDX-License-Identifier: MPL-2.0
"""StageMessage — the only currency that flows between stages.

Per AGENTS.md § 1.3, no bare `dict`, `str`, or tuple is allowed to
cross stage boundaries. Every stage takes a `StageMessage` and returns
a (possibly new) `StageMessage`.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class StageRecord(BaseModel):
    """A single stage's contribution to the running message."""

    stage: str
    started_at: datetime
    finished_at: datetime
    provider_label: str | None = None
    model: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    note: str | None = None


class StageMessage(BaseModel):
    """The end-to-end document state shared by every stage.

    Stages MAY add to `payload`, MUST append a `StageRecord` to
    `history`, and MUST NOT mutate prior history entries.
    """

    run_id: str = Field(default_factory=lambda: uuid4().hex)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    payload: dict[str, Any] = Field(default_factory=dict)
    history: list[StageRecord] = Field(default_factory=list)

    model_config = {"frozen": False, "extra": "forbid"}

    def with_record(self, record: StageRecord) -> StageMessage:
        """Return a copy with `record` appended to history."""
        return self.model_copy(update={"history": [*self.history, record]})


def validate(msg: StageMessage) -> StageMessage:
    """Round-trip validation; raises pydantic ValidationError on bad data."""
    return StageMessage.model_validate(msg.model_dump())
