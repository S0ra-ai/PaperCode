# SPDX-License-Identifier: MPL-2.0
"""Survey orchestrator: domain → literature → taxonomy → draft → export.

Chains the M6 stages. ``DomainClarifyStage`` is outside the loop in
interactive mode (TUI feeds ``payload['domain_inputs']`` before
invoking ``run``). ``TaxonomyConfirmStage`` honours any
``payload['taxonomy_edits']`` supplied by the TUI; otherwise it
auto-accepts.

Export (LaTeX / PDF / DOCX) is unchanged from M1. The orchestrator
loads the IEEE ``FormatSpec`` from the builtin cache and plants
``payload['format_spec']`` + ``payload['clarify']`` fields so the
shared export stages work without modification.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path

from app.config.survey import SurveyConfig
from app.core.contract import StageMessage
from app.core.contract.survey_types import DomainSpec
from app.core.formats.cache import get as cache_get
from app.core.stages import (
    cite_bind,
    corpus_curate,
    domain_clarify,
    export_docx,
    export_latex,
    export_pdf,
    literature_search,
    pdf_on_demand,
    survey_draft,
    survey_outline,
    taxonomy_confirm,
    taxonomy_draft,
    verify_refs,
)
from app.providers.registry import ProviderRegistry


@dataclass(frozen=True)
class StageEvent:
    stage: str
    status: str  # "started" | "finished" | "failed"
    detail: str = ""


class _Skipper:
    def __init__(self, start_after: str | None) -> None:
        self._target = start_after
        self._still_skipping = start_after is not None

    def check(self, stage: str) -> bool:
        if not self._still_skipping:
            return False
        if stage == self._target:
            self._still_skipping = False
        return True


def _ensure_format_spec(msg: StageMessage, venue_label: str) -> StageMessage:
    """Populate payload['format_spec'] from the builtin IEEE entry.

    Survey paths always use the builtin IEEE template by default. Callers
    can override by pre-populating ``payload['format_spec']`` themselves
    (e.g. when the TUI ran FormatStage on a user-supplied sample PDF).
    """

    if "format_spec" in msg.payload:
        return msg
    hit = cache_get(venue_label=venue_label)
    if hit is None:
        raise RuntimeError(
            f"survey orchestrator: no builtin FormatSpec for {venue_label!r}; "
            "is templates/builtin_formats/ missing?"
        )
    spec, _tier = hit
    new = msg.model_copy(deep=True)
    new.payload["format_spec"] = spec.model_dump(mode="json")
    return new


def _ensure_clarify_author(msg: StageMessage) -> StageMessage:
    """Backfill ``payload['clarify']`` so the shared export_latex stage works."""

    domain = DomainSpec.model_validate(msg.payload["domain"])
    clarify = dict(msg.payload.get("clarify") or {})
    clarify.setdefault("author", domain.author)
    clarify.setdefault("topic", domain.domain)
    clarify.setdefault("language", domain.language)
    clarify.setdefault("style", "ieee")
    clarify.setdefault("length_pages", max(4, domain.length_words // 600))
    new = msg.model_copy(deep=True)
    new.payload["clarify"] = clarify
    return new


async def run(
    msg: StageMessage,
    *,
    registry: ProviderRegistry,
    config: SurveyConfig | None = None,
    output_dir: Path | None = None,
    venue_label: str = "IEEE",
    skip_export_pdf: bool = False,
    skip_export_docx: bool = False,
    start_after: str | None = None,
) -> AsyncIterator[tuple[StageMessage, StageEvent]]:
    """Drive the survey pipeline; yields ``(msg, event)`` after each stage."""

    cfg = config or SurveyConfig()
    skipper = _Skipper(start_after)

    if not skipper.check("domain_clarify"):
        yield msg, StageEvent(stage="domain_clarify", status="started")
        msg = await domain_clarify.run(msg)
        yield (
            msg,
            StageEvent(
                stage="domain_clarify",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )

    if not skipper.check("lit_search"):
        yield msg, StageEvent(stage="lit_search", status="started")
        msg = await literature_search.run(msg, config=cfg)
        yield (
            msg,
            StageEvent(
                stage="lit_search", status="finished", detail=msg.history[-1].note or ""
            ),
        )

    if not skipper.check("corpus_curate"):
        yield msg, StageEvent(stage="corpus_curate", status="started")
        msg = await corpus_curate.run(msg, config=cfg)
        yield (
            msg,
            StageEvent(
                stage="corpus_curate",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )

    if not skipper.check("taxonomy_draft"):
        yield msg, StageEvent(stage="taxonomy_draft", status="started")
        msg = await taxonomy_draft.run(msg, registry=registry)
        yield (
            msg,
            StageEvent(
                stage="taxonomy_draft",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )

    if not skipper.check("taxonomy_confirm"):
        yield msg, StageEvent(stage="taxonomy_confirm", status="started")
        msg = await taxonomy_confirm.run(msg)
        yield (
            msg,
            StageEvent(
                stage="taxonomy_confirm",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )

    if cfg.pdf_on_demand_enabled and not skipper.check("pdf_on_demand"):
        yield msg, StageEvent(stage="pdf_on_demand", status="started")
        msg = await pdf_on_demand.run(msg, config=cfg)
        yield (
            msg,
            StageEvent(
                stage="pdf_on_demand",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )

    if not skipper.check("survey_outline"):
        yield msg, StageEvent(stage="survey_outline", status="started")
        msg = await survey_outline.run(msg, registry=registry)
        yield (
            msg,
            StageEvent(
                stage="survey_outline",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )

    if not skipper.check("survey_draft"):
        yield msg, StageEvent(stage="survey_draft", status="started")
        msg = await survey_draft.run(msg, registry=registry, config=cfg)
        yield (
            msg,
            StageEvent(
                stage="survey_draft",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )

    if not skipper.check("cite_bind"):
        yield msg, StageEvent(stage="cite_bind", status="started")
        msg = await cite_bind.run(msg)
        yield (
            msg,
            StageEvent(
                stage="cite_bind", status="finished", detail=msg.history[-1].note or ""
            ),
        )

    if not skipper.check("verify"):
        yield msg, StageEvent(stage="verify", status="started")
        msg = await verify_refs.run(msg)
        yield (
            msg,
            StageEvent(
                stage="verify", status="finished", detail=msg.history[-1].note or ""
            ),
        )

    msg = _ensure_format_spec(msg, venue_label)
    msg = _ensure_clarify_author(msg)

    if not skipper.check("export_latex"):
        yield msg, StageEvent(stage="export_latex", status="started")
        msg = await export_latex.run(msg, output_dir=output_dir)
        yield (
            msg,
            StageEvent(
                stage="export_latex",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )

    if not skip_export_pdf and not skipper.check("export_pdf"):
        yield msg, StageEvent(stage="export_pdf", status="started")
        msg = await export_pdf.run(msg)
        yield (
            msg,
            StageEvent(
                stage="export_pdf",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )

    if not skip_export_docx and not skipper.check("export_docx"):
        yield msg, StageEvent(stage="export_docx", status="started")
        msg = await export_docx.run(msg)
        yield (
            msg,
            StageEvent(
                stage="export_docx",
                status="finished",
                detail=msg.history[-1].note or "",
            ),
        )
