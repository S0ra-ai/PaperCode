# SPDX-License-Identifier: MPL-2.0
"""CiteFetchStage — resolve `[CITE:<key>]` placeholders in the draft.

Strategy (M1):
1. Collect all unique placeholder keys from every section's text.
2. For each, query Crossref first, fall back to arXiv, fall back to a
   `misc` BibEntry stub. Network errors degrade to stubs (do **not**
   block — `VerifyStage` is what fails closed, not this one).
3. Replace `[CITE:<key>]` with `\\cite{<bibkey>}` in the section text.
4. Write the final BibTeX into ``payload['bibliography']`` and the
   patched draft back into ``payload['draft']``.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

import httpx

from app.core.citations import (
    ArxivClient,
    CrossrefClient,
    format_bibtex,
)
from app.core.citations.bibtex import BibEntry, from_arxiv, from_crossref, make_key
from app.core.contract import StageMessage, StageRecord

STAGE = "cite"

PLACEHOLDER = re.compile(r"\[CITE:([^\]]+)\]")


async def _resolve_one(
    placeholder: str,
    *,
    crossref: CrossrefClient,
    arxiv: ArxivClient,
) -> BibEntry:
    try:
        items = await crossref.search(placeholder, rows=1)
        if items:
            return from_crossref(items[0])
    except httpx.HTTPError:
        pass
    try:
        results = await arxiv.search(placeholder, max_results=1)
        if results:
            return from_arxiv(results[0])
    except httpx.HTTPError:
        pass
    return BibEntry(
        key=make_key(first_author="anon", year="n.d.", title=placeholder),
        entry_type="misc",
        fields={"title": placeholder, "note": "unresolved citation placeholder"},
        source="manual",
    )


async def run(
    msg: StageMessage,
    *,
    crossref: CrossrefClient | None = None,
    arxiv: ArxivClient | None = None,
) -> StageMessage:
    started = datetime.now(UTC)
    own_cr = crossref is None
    own_ax = arxiv is None
    crossref = crossref or CrossrefClient()
    arxiv = arxiv or ArxivClient()
    try:
        draft = msg.payload["draft"]
        sections = draft.get("sections", [])
        keys: list[str] = []
        for sec in sections:
            for m in PLACEHOLDER.finditer(sec.get("text", "")):
                k = m.group(1).strip()
                if k and k not in keys:
                    keys.append(k)
        resolved: dict[str, BibEntry] = {}
        for placeholder in keys:
            resolved[placeholder] = await _resolve_one(
                placeholder, crossref=crossref, arxiv=arxiv
            )
        # Patch draft text.
        new_sections = []
        for sec in sections:
            text = sec.get("text", "")

            def _sub(match: re.Match[str]) -> str:
                key = match.group(1).strip()
                bib = resolved.get(key)
                return f"\\cite{{{bib.key}}}" if bib else match.group(0)

            new_sections.append(
                {"name": sec["name"], "text": PLACEHOLDER.sub(_sub, text)}
            )
        new = msg.model_copy(deep=True)
        new.payload["draft"]["sections"] = new_sections
        new.payload["bibliography"] = format_bibtex(list(resolved.values()))
        new.payload["citations"] = [
            {"placeholder": k, "key": v.key, "source": v.source}
            for k, v in resolved.items()
        ]
        record = StageRecord(
            stage=STAGE,
            started_at=started,
            finished_at=datetime.now(UTC),
            note=f"resolved {len(resolved)} citations",
        )
        return new.with_record(record)
    finally:
        if own_cr:
            await crossref.aclose()
        if own_ax:
            await arxiv.aclose()
