# SPDX-License-Identifier: MPL-2.0
"""TaxonomyConfirmStage — accept LLM draft or apply user edits.

Autopilot (default): marks ``taxonomy.source = 'auto_accept'`` and
returns. Interactive: if ``payload['taxonomy_edits']`` is present (TUI
writes it), replace ``taxonomy.branches`` accordingly and mark
``source='user_edited'``.

Edit schema (from TUI)::

    {
        "branches": [
            {"id": "b1", "title": "...", "description": "...",
             "members": ["corpus_key_1", ...]}
        ]
    }
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.core.contract import StageMessage, StageRecord
from app.core.contract.survey_types import (
    CorpusItem,
    Taxonomy,
    TaxonomyBranch,
)

STAGE = "taxonomy_confirm"


async def run(msg: StageMessage) -> StageMessage:
    started = datetime.now(UTC)
    tax = Taxonomy.model_validate(msg.payload["taxonomy"])
    edits = msg.payload.get("taxonomy_edits")

    if edits:
        keys = {CorpusItem.model_validate(c).key for c in msg.payload.get("corpus", [])}
        branches = tuple(
            TaxonomyBranch(
                id=str(b.get("id") or f"b{i + 1}"),
                title=str(b.get("title") or f"Branch {i + 1}"),
                description=str(b.get("description") or ""),
                members=tuple(k for k in (b.get("members") or []) if k in keys),
            )
            for i, b in enumerate(edits.get("branches", []))
        )
        branches = tuple(b for b in branches if b.members)
        if not branches:
            raise RuntimeError(
                "TaxonomyConfirmStage: user edits left no populated branches"
            )
        tax = Taxonomy(branches=branches, source="user_edited")
        note = f"user_edited {len(branches)} branches"
    else:
        tax = tax.model_copy(update={"source": "auto_accept"})
        note = f"auto_accept {len(tax.branches)} branches"

    new = msg.model_copy(deep=True)
    new.payload["taxonomy"] = tax.model_dump()
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=note,
    )
    return new.with_record(record)
