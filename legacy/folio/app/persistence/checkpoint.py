# SPDX-License-Identifier: MPL-2.0
"""Checkpoint system: snapshots of stage input/output for recovery.

Allows users to resume from intermediate checkpoints if a run fails,
and enables fast recovery from transient errors. Checkpoints are stored
as full StageMessage pairs (input + output).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.core.contract import StageMessage

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


async def create_checkpoint(
    run_id: str,
    stage_name: str,
    checkpoint_num: int,
    input_msg: StageMessage,
    output_msg: StageMessage,
    note: str | None = None,
    db_session: Session | None = None,
) -> None:
    """Create a checkpoint snapshot for a stage.

    Args:
        run_id: Run ID (uuid string).
        stage_name: Stage name (e.g., 'outline', 'draft').
        checkpoint_num: Ordinal number within run (0, 1, 2, ...).
        input_msg: Full input StageMessage.
        output_msg: Full output StageMessage.
        note: Optional human-readable note.
        db_session: SQLAlchemy session (if provided, saves to DB).
    """
    if db_session is None:
        return

    from app.persistence.db import CheckpointRow

    row = CheckpointRow(
        run_id=run_id,
        stage_name=stage_name,
        checkpoint_num=checkpoint_num,
        input_msg=input_msg.model_dump(),
        output_msg=output_msg.model_dump(),
        created_at=datetime.now(UTC),
        note=note,
    )
    db_session.add(row)
    db_session.commit()


async def list_checkpoints(
    run_id: str, db_session: Session | None = None
) -> list[tuple[int, str, datetime, str | None]]:
    """List all checkpoints for a run.

    Returns list of (checkpoint_num, stage_name, created_at, note) tuples,
    sorted by checkpoint_num.
    """
    if db_session is None:
        return []

    from app.persistence.db import CheckpointRow

    rows = (
        db_session.query(CheckpointRow)
        .filter_by(run_id=run_id)
        .order_by(CheckpointRow.checkpoint_num)
        .all()
    )

    return [(r.checkpoint_num, r.stage_name, r.created_at, r.note) for r in rows]


async def get_checkpoint(
    run_id: str, checkpoint_num: int, db_session: Session | None = None
) -> StageMessage | None:
    """Retrieve a checkpoint by number.

    Returns the output_msg (StageMessage) at that checkpoint, or None.
    """
    if db_session is None:
        return None

    from app.persistence.db import CheckpointRow

    row = (
        db_session.query(CheckpointRow)
        .filter_by(run_id=run_id, checkpoint_num=checkpoint_num)
        .first()
    )

    if row:
        try:
            return StageMessage.model_validate(row.output_msg)
        except Exception:
            pass

    return None


async def delete_checkpoint(
    run_id: str, checkpoint_num: int, db_session: Session | None = None
) -> None:
    """Delete a checkpoint.

    Args:
        run_id: Run ID.
        checkpoint_num: Checkpoint number to delete.
        db_session: SQLAlchemy session.
    """
    if db_session is None:
        return

    from app.persistence.db import CheckpointRow

    db_session.query(CheckpointRow).filter_by(
        run_id=run_id, checkpoint_num=checkpoint_num
    ).delete()
    db_session.commit()


async def clear_checkpoints(run_id: str, db_session: Session | None = None) -> int:
    """Delete all checkpoints for a run.

    Returns number of rows deleted.
    """
    if db_session is None:
        return 0

    from app.persistence.db import CheckpointRow

    count = db_session.query(CheckpointRow).filter_by(run_id=run_id).delete()
    db_session.commit()
    return count
