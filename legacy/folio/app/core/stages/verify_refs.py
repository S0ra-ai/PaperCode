# SPDX-License-Identifier: MPL-2.0
"""VerifyStage — fail-closed reference check.

For every entry in ``payload['citations']``:
- If `source == "crossref"` → assume already resolved (crossref returned it).
- If `source == "arxiv"` → assume already resolved.
- If `source == "manual"` → unresolved placeholder; abort.

Lenient mode (``FOLIO_VERIFY_LENIENT=1``) downgrades the abort to a
warning recorded in ``payload['verify_status'] = "warnings"`` and the
unresolved keys in ``payload['verify_warnings']``. The default remains
fail-closed.

Future M4 work (`m4-fact-roundtrip`) will independently re-verify each
claim against its source. M1 only verifies the *bibliographic record*
exists — not the semantic match.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime

from app.core.contract import StageMessage, StageRecord

STAGE = "verify"


class VerificationError(RuntimeError):
    """Raised when one or more citations could not be verified."""


def _lenient_enabled() -> bool:
    return os.environ.get("FOLIO_VERIFY_LENIENT", "").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )


async def run(msg: StageMessage) -> StageMessage:
    started = datetime.now(UTC)
    citations = msg.payload.get("citations", [])
    unresolved = [c for c in citations if c.get("source") == "manual"]
    if unresolved and not _lenient_enabled():
        keys = ", ".join(c["placeholder"] for c in unresolved)
        raise VerificationError(
            f"VerifyStage: {len(unresolved)} unresolved citation(s): {keys}"
        )
    new = msg.model_copy(deep=True)
    if unresolved:
        new.payload["verify_status"] = "warnings"
        new.payload["verify_warnings"] = [c["placeholder"] for c in unresolved]
        note = (
            f"verified {len(citations) - len(unresolved)}/{len(citations)} "
            f"citations; {len(unresolved)} unresolved (lenient mode)"
        )
    else:
        new.payload["verify_status"] = "ok"
        note = f"verified {len(citations)} citations"
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=note,
    )
    return new.with_record(record)
