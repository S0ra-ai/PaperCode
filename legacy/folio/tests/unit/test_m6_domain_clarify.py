# SPDX-License-Identifier: MPL-2.0
from __future__ import annotations

import pytest

from app.core.contract import StageMessage
from app.core.stages import domain_clarify


@pytest.mark.asyncio
async def test_domain_clarify_validates_and_seeds_budget() -> None:
    msg = StageMessage(
        payload={
            "domain_inputs": {
                "domain": "transformer time series",
                "keywords": ["forecasting", "attention"],
                "length_words": 12000,
                "author": "Jane",
            }
        }
    )
    out = await domain_clarify.run(msg)
    assert out.payload["task_type"] == "survey_from_domain"
    assert out.payload["domain"]["domain"] == "transformer time series"
    assert out.payload["domain"]["author"] == "Jane"
    assert out.payload["budget"]["total_words"] == 12000
    assert out.history[-1].stage == "domain_clarify"


@pytest.mark.asyncio
async def test_domain_clarify_rejects_missing_inputs() -> None:
    msg = StageMessage(payload={})
    with pytest.raises(RuntimeError):
        await domain_clarify.run(msg)
