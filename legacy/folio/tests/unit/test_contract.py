# SPDX-License-Identifier: MPL-2.0
"""Smoke tests for the StageMessage contract."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.core.contract import (
    Capability,
    CapFlag,
    StageMessage,
    StageRecord,
    validate,
)


def test_stage_message_round_trips() -> None:
    msg = StageMessage(payload={"topic": "hello"})
    assert validate(msg).payload == {"topic": "hello"}


def test_stage_message_history_is_append_only_via_with_record() -> None:
    msg = StageMessage()
    rec = StageRecord(
        stage="draft",
        started_at=datetime.now(UTC),
        finished_at=datetime.now(UTC),
    )
    new = msg.with_record(rec)
    assert len(new.history) == 1
    assert len(msg.history) == 0  # original untouched


def test_stage_message_rejects_unknown_fields() -> None:
    with pytest.raises(ValidationError):
        StageMessage.model_validate({"payload": {}, "history": [], "bogus": 1})


def test_capability_supports_flag() -> None:
    cap = Capability(
        label="dev",
        base_url="https://example.com/v1",
        default_model="m",
        flags=frozenset({CapFlag.CHAT, CapFlag.STREAM}),
    )
    assert cap.supports(CapFlag.CHAT)
    assert not cap.supports(CapFlag.EMBEDDINGS)
