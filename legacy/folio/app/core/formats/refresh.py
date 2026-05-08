# SPDX-License-Identifier: MPL-2.0
"""Format refresh policy.

Decides *when* a cached FormatSpec should be re-extracted. The
policy is deliberately separated from the cache itself so the TUI,
CLI, and orchestrator can all reuse it.

See plan.md § 4a — "Refresh triggers".
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.core.formats import FormatSpec, is_stale


class RefreshReason(StrEnum):
    NONE = "none"
    USER_FORCED = "user_forced"  # --refresh-format
    VENUE_TTL = "venue_ttl"  # > 30 days, prompt user
    SCHEMA_INVALID = "schema_invalid"  # cache returned None on read


@dataclass(frozen=True)
class RefreshDecision:
    refresh: bool
    reason: RefreshReason
    prompt_user: bool  # whether the TUI should ask before refreshing
    note: str = ""


def decide(
    spec: FormatSpec | None,
    *,
    user_forced: bool = False,
) -> RefreshDecision:
    """Decide whether `spec` should be refreshed.

    `spec=None` → caller had a cache miss; downstream `FormatStage`
    will run unconditionally (no decision needed here).
    """
    if user_forced:
        return RefreshDecision(
            refresh=True,
            reason=RefreshReason.USER_FORCED,
            prompt_user=False,
            note="--refresh-format was passed",
        )
    if spec is None:
        return RefreshDecision(
            refresh=True,
            reason=RefreshReason.SCHEMA_INVALID,
            prompt_user=False,
            note="cache miss / schema invalidated",
        )
    if spec.source == "venue" and is_stale(spec):
        return RefreshDecision(
            refresh=False,
            reason=RefreshReason.VENUE_TTL,
            prompt_user=True,
            note=f"venue spec for {spec.venue_label!r} is older than 30 days",
        )
    if spec.source == "custom":
        # User-owned: never auto-refresh, never prompt.
        return RefreshDecision(
            refresh=False,
            reason=RefreshReason.NONE,
            prompt_user=False,
        )
    return RefreshDecision(
        refresh=False,
        reason=RefreshReason.NONE,
        prompt_user=False,
    )
