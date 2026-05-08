# SPDX-License-Identifier: MPL-2.0
"""Stage result caching: outline, draft, cite, verify outputs.

Caches the full `StageMessage` payload (inputs + outputs) after each
stage runs, using a hash of the stage inputs to key. Allows fast recovery
from intermediate failures and cross-session reuse of expensive stages.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.core.contract import StageMessage

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


def hash_inputs(stage_name: str, payload: dict[str, object]) -> str:
    """Compute stable SHA256 hash of stage inputs.

    Uses stage name + serialized input fields (depends on stage).
    """
    # Extract stage-specific input fields
    inputs_str = f"{stage_name}:"

    # Common input fields that affect stage output
    input_keys = ["title", "abstract", "keywords", "pdf_text", "outline", "draft"]
    for key in input_keys:
        if key in payload:
            val = payload[key]
            if isinstance(val, (str, int, float, bool)):
                inputs_str += f"{key}={val!r};"
            elif isinstance(val, (list, dict)):
                inputs_str += f"{key}={len(str(val))};"

    h = hashlib.sha256(inputs_str.encode()).hexdigest()
    return h[:32]


async def lookup_stage_cache(
    run_id: str,
    stage_name: str,
    inputs_hash: str,
    db: Session | None = None,
) -> StageMessage | None:
    """Look up cached StageMessage result for a stage.

    Returns the cached output message if found and valid, None otherwise.
    """
    if db is None:
        return None

    from app.persistence.db import StageCacheRow

    row = (
        db.query(StageCacheRow)
        .filter_by(run_id=run_id, stage_name=stage_name, inputs_hash=inputs_hash)
        .first()
    )

    if row:
        try:
            return StageMessage.model_validate(row.payload)
        except Exception:
            pass

    return None


async def save_stage_cache(
    run_id: str,
    stage_name: str,
    inputs_hash: str,
    msg: StageMessage,
    db: Session | None = None,
) -> None:
    """Save StageMessage result to cache.

    Args:
        run_id: Run ID (uuid string).
        stage_name: Name of the stage ('outline', 'draft', etc.).
        inputs_hash: Hash of stage inputs (use hash_inputs()).
        msg: The StageMessage output.
        db: SQLAlchemy session (if provided, saves to DB).
    """
    if db is None:
        return

    from app.persistence.db import StageCacheRow

    row = StageCacheRow(
        run_id=run_id,
        stage_name=stage_name,
        inputs_hash=inputs_hash,
        payload=msg.model_dump(),
        cached_at=datetime.now(UTC),
    )
    db.add(row)
    db.commit()


async def list_stage_cache(
    run_id: str, stage_name: str | None = None, db: Session | None = None
) -> list[tuple[str, datetime]]:
    """List all cached results for a run (optionally filtered by stage).

    Returns list of (inputs_hash, cached_at) tuples.
    """
    if db is None:
        return []

    from app.persistence.db import StageCacheRow

    q = db.query(StageCacheRow.inputs_hash, StageCacheRow.cached_at).filter_by(
        run_id=run_id
    )
    if stage_name:
        q = q.filter_by(stage_name=stage_name)

    return [(row[0], row[1]) for row in q.order_by(StageCacheRow.cached_at).all()]


async def clear_stage_cache(
    run_id: str, stage_name: str | None = None, db: Session | None = None
) -> int:
    """Clear cached results for a run (optionally filtered by stage).

    Returns number of rows deleted.
    """
    if db is None:
        return 0

    from app.persistence.db import StageCacheRow

    q = db.query(StageCacheRow).filter_by(run_id=run_id)
    if stage_name:
        q = q.filter_by(stage_name=stage_name)

    count = q.delete()
    db.commit()
    return count
