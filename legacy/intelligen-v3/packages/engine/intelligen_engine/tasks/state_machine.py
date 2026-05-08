"""Task state machine — validates transitions and records history in Redis.

Statuses:
  pending → clarifying | planning
  clarifying → planning | cancelled
  planning → generating | failed | cancelled
  generating → reviewing | completed | failed | cancelled
  reviewing → exporting | completed | failed | cancelled
  exporting → completed | failed | cancelled
  failed → pending (retry)
"""

from __future__ import annotations

import json
import logging
import time
from typing import Optional

from intelligen_engine.core.redis import get_redis

logger = logging.getLogger(__name__)

# Valid transitions: current_status → set of allowed next statuses
VALID_TRANSITIONS: dict[str, set[str]] = {
    "pending":    {"clarifying", "planning", "generating", "cancelled", "failed"},
    "clarifying": {"planning", "generating", "cancelled", "failed"},
    "planning":   {"generating", "failed", "cancelled"},
    "generating": {"reviewing", "completed", "failed", "cancelled"},
    "reviewing":  {"exporting", "completed", "failed", "cancelled"},
    "exporting":  {"completed", "failed", "cancelled"},
    "failed":     {"pending"},  # retry
    "completed":  set(),
    "cancelled":  set(),
}

TERMINAL_STATES = {"completed", "failed", "cancelled"}
ACTIVE_STATES = {"pending", "clarifying", "planning", "generating", "reviewing", "exporting"}

_TRANSITION_HISTORY_KEY = "engine:task:{task_id}:transitions"
_TRANSITION_HISTORY_TTL = 86400 * 7  # 7 days


class InvalidTransitionError(Exception):
    """Raised when a state transition is not allowed."""

    def __init__(self, task_id: str, from_status: str, to_status: str):
        self.task_id = task_id
        self.from_status = from_status
        self.to_status = to_status
        super().__init__(
            f"Invalid transition for task {task_id}: {from_status} → {to_status}"
        )


async def validate_transition(from_status: str, to_status: str) -> bool:
    """Check whether a transition is valid without performing it."""
    allowed = VALID_TRANSITIONS.get(from_status, set())
    return to_status in allowed


async def transition(
    task_id: str,
    from_status: str,
    to_status: str,
    *,
    reason: Optional[str] = None,
    strict: bool = True,
) -> bool:
    """Validate and record a state transition.

    Args:
        task_id: The task identifier.
        from_status: Expected current status.
        to_status: Desired new status.
        reason: Optional reason for the transition.
        strict: If True, raise on invalid transition; otherwise log and return False.

    Returns:
        True if the transition was recorded.
    """
    allowed = VALID_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        if strict:
            raise InvalidTransitionError(task_id, from_status, to_status)
        logger.warning(
            f"Ignoring invalid transition for task {task_id}: "
            f"{from_status} → {to_status}"
        )
        return False

    record = {
        "from": from_status,
        "to": to_status,
        "timestamp": time.time(),
        "reason": reason or "",
    }

    r = get_redis()
    key = _TRANSITION_HISTORY_KEY.format(task_id=task_id)
    await r.rpush(key, json.dumps(record, ensure_ascii=False))
    await r.expire(key, _TRANSITION_HISTORY_TTL)

    logger.debug(f"Task {task_id}: {from_status} → {to_status}" +
                 (f" ({reason})" if reason else ""))
    return True


async def get_transition_history(task_id: str) -> list[dict]:
    """Return the full transition history for a task."""
    r = get_redis()
    key = _TRANSITION_HISTORY_KEY.format(task_id=task_id)
    raw_list = await r.lrange(key, 0, -1)
    history = []
    for raw in raw_list:
        try:
            history.append(json.loads(raw))
        except (json.JSONDecodeError, TypeError):
            continue
    return history


def is_terminal(status: str) -> bool:
    """Return True if the status is a terminal state."""
    return status in TERMINAL_STATES


def is_active(status: str) -> bool:
    """Return True if the status is an active (non-terminal) state."""
    return status in ACTIVE_STATES
