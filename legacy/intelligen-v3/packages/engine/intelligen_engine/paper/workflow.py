"""Stage contract for the paper-generation agent workflow."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import StrEnum
from typing import Literal


class PaperStage(StrEnum):
    INTENT_PARSE = "intent_parse"
    CLARIFY = "clarify"
    FORMAT_RESOLVE = "format_resolve"
    LITERATURE_SEARCH = "literature_search"
    OUTLINE = "outline"
    DRAFT = "draft"
    CITATION_VERIFY = "citation_verify"
    FORMAT_AUDIT = "format_audit"
    REPAIR = "repair"
    EXPORT = "export"
    EXPERIMENT = "experiment"
    FIGURE_TABLE_AUDIT = "figure_table_audit"


StageStatus = Literal[
    "pending",
    "running",
    "waiting_user",
    "completed",
    "failed",
    "skipped",
]


@dataclass(frozen=True)
class PaperStageEvent:
    stage: PaperStage
    status: StageStatus
    message: str = ""
    progress_pct: float = 0.0
    payload: dict[str, object] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        data = asdict(self)
        data["stage"] = self.stage.value
        return data


DEFAULT_STAGE_ORDER: tuple[PaperStage, ...] = (
    PaperStage.INTENT_PARSE,
    PaperStage.CLARIFY,
    PaperStage.FORMAT_RESOLVE,
    PaperStage.LITERATURE_SEARCH,
    PaperStage.OUTLINE,
    PaperStage.DRAFT,
    PaperStage.CITATION_VERIFY,
    PaperStage.FORMAT_AUDIT,
    PaperStage.REPAIR,
    PaperStage.EXPORT,
    PaperStage.EXPERIMENT,
    PaperStage.FIGURE_TABLE_AUDIT,
)


def initial_stage_events() -> list[PaperStageEvent]:
    """Return a full stage list suitable for first WebUI render."""

    return [
        PaperStageEvent(stage=stage, status="pending")
        for stage in DEFAULT_STAGE_ORDER
    ]
