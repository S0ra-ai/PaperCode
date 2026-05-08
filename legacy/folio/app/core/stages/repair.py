# SPDX-License-Identifier: MPL-2.0
"""RepairStage — deterministic auto-fix handlers for failed stages.

Inspired by Copilot's "auto-fix problems" loop. Per AGENTS.md §1.1 the
TUI must not make business decisions, so all repair logic lives here in
the core. The orchestrator calls a per-stage repairer as a last-resort
recovery before propagating the failure.

Currently implemented:

- ``repair_verify(msg, exc)`` — when ``VerifyStage`` aborts because of
  unresolved ``manual`` citations, drop those citations from the
  payload, rebuild the BibTeX block without them, and strip the
  corresponding ``\\cite{key}`` markers (with surrounding-punctuation
  cleanup) from each section's text. Records the repair in
  ``msg.history`` so it shows up in the transcript.

This stage is **deterministic** — no LLM call. The function is
side-effect-free and returns a new ``StageMessage``.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from app.core.contract import StageMessage, StageRecord

STAGE = "repair"

_BIBTEX_BLOCK = re.compile(r"@\w+\s*\{\s*([^,\s]+)\s*,", re.MULTILINE)


def _filter_bibtex(bibliography: str, drop_keys: set[str]) -> str:
    """Drop bibtex entries whose first-line key is in ``drop_keys``."""
    if not bibliography or not drop_keys:
        return bibliography
    blocks = re.split(r"\n\s*\n", bibliography.strip())
    kept: list[str] = []
    for block in blocks:
        m = _BIBTEX_BLOCK.search(block)
        if m and m.group(1) in drop_keys:
            continue
        kept.append(block)
    return "\n\n".join(kept) + ("\n" if kept else "")


def _strip_cites(text: str, drop_keys: set[str]) -> str:
    """Remove ``\\cite{key[, key2]}`` references for dropped keys.

    Handles multi-key ``\\cite{a,b,c}`` by keeping the surviving subset
    or removing the whole macro if every key was dropped. Also tidies
    surrounding parentheses, brackets and double-spacing introduced by
    the removal so the prose stays readable (and idempotent).
    """
    if not drop_keys:
        return text

    def _sub(match: re.Match[str]) -> str:
        keys = [k.strip() for k in match.group(1).split(",") if k.strip()]
        kept = [k for k in keys if k not in drop_keys]
        if not kept:
            return ""
        return "\\cite{" + ",".join(kept) + "}"

    out = re.sub(r"\\cite\{([^}]*)\}", _sub, text)
    # Tidy: empty parens/brackets, double spaces, orphan punctuation.
    out = re.sub(r"\(\s*\)", "", out)
    out = re.sub(r"\[\s*\]", "", out)
    out = re.sub(r"\s+([,.;:!?])", r"\1", out)
    out = re.sub(r"[ \t]{2,}", " ", out)
    return out


def repair_verify(msg: StageMessage, exc: BaseException) -> StageMessage:
    """Drop unresolved manual citations and the \\cite markers that use them."""
    started = datetime.now(UTC)
    citations = list(msg.payload.get("citations") or [])
    drop = {c["key"] for c in citations if c.get("source") == "manual" and c.get("key")}
    if not drop:
        return msg

    new = msg.model_copy(deep=True)
    new.payload["citations"] = [c for c in citations if c.get("source") != "manual"]
    new.payload["bibliography"] = _filter_bibtex(
        str(new.payload.get("bibliography") or ""), drop
    )
    draft = new.payload.get("draft") or {}
    sections = draft.get("sections") or []
    new_sections = []
    for sec in sections:
        new_sections.append(
            {
                "name": sec.get("name", ""),
                "text": _strip_cites(sec.get("text", ""), drop),
            }
        )
    if sections:
        new.payload["draft"]["sections"] = new_sections

    note = (
        f"repair: dropped {len(drop)} unresolved citation(s) "
        f"({', '.join(sorted(drop)[:3])}{'…' if len(drop) > 3 else ''}); "
        f"trigger: {type(exc).__name__}"
    )
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=note,
    )
    return new.with_record(record)
