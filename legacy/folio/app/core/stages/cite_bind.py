# SPDX-License-Identifier: MPL-2.0
"""CiteBindStage — bind corpus-scoped [CITE:<key>] placeholders locally.

Unlike M1's ``CiteFetchStage`` which talks to Crossref/arXiv to resolve
free-form placeholders, the survey pipeline already has a vetted
corpus. For each ``[CITE:<key>]`` whose key is in the corpus:

1. Build a ``BibEntry`` from the ``CorpusItem`` (DOI → article / arXiv
   → misc / bare title → misc).
2. Replace the placeholder with ``\\cite{<bibkey>}``.

All produced citations are tagged ``source="corpus"`` — ``VerifyStage``
treats that as pre-verified (the corpus was curated with stable IDs).
Unknown placeholders are stripped silently (SurveyDraftStage already
filters them, but we defend in depth).

No network calls here.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

from app.core.citations.bibtex import BibEntry, format_bibtex, make_key
from app.core.contract import StageMessage, StageRecord
from app.core.contract.survey_types import CorpusItem

STAGE = "cite_bind"

_PLACEHOLDER = re.compile(r"\[CITE:([^\]]+)\]")


def _bib_from_item(item: CorpusItem) -> BibEntry:
    first_author = item.authors[0] if item.authors else "Anonymous"
    year = str(item.year) if item.year else "n.d."
    key = make_key(first_author=first_author, year=year, title=item.title or "untitled")
    fields: dict[str, str] = {
        "title": item.title or "Untitled",
        "author": " and ".join(item.authors) if item.authors else "Anonymous",
        "year": year,
    }
    if item.venue:
        fields["journal"] = item.venue
    if item.doi:
        fields["doi"] = item.doi
        entry_type = "article"
    elif item.arxiv_id:
        fields["eprint"] = item.arxiv_id
        fields["archivePrefix"] = "arXiv"
        entry_type = "misc"
    else:
        entry_type = "misc"
    if item.url:
        fields["url"] = item.url
    return BibEntry(key=key, entry_type=entry_type, fields=fields, source="corpus")


def _dedupe_keys(entries: list[BibEntry]) -> list[BibEntry]:
    seen: dict[str, BibEntry] = {}
    for e in entries:
        key = e.key
        i = 0
        while key in seen and seen[key].fields != e.fields:
            i += 1
            key = f"{e.key}{chr(ord('a') + i - 1)}"
        if key != e.key:
            e = BibEntry(
                key=key, entry_type=e.entry_type, fields=e.fields, source=e.source
            )
        seen[key] = e
    return list(seen.values())


async def run(msg: StageMessage) -> StageMessage:
    started = datetime.now(UTC)
    draft = msg.payload.get("draft")
    if not draft:
        raise RuntimeError("CiteBindStage: payload['draft'] is required")
    corpus = {c["key"]: CorpusItem.model_validate(c) for c in msg.payload["corpus"]}

    used_keys: list[str] = []
    for section in draft.get("sections", []):
        for m in _PLACEHOLDER.finditer(section.get("text", "")):
            k = m.group(1).strip()
            if k in corpus and k not in used_keys:
                used_keys.append(k)
    # also search abstract_brief
    for m in _PLACEHOLDER.finditer(draft.get("abstract_brief", "")):
        k = m.group(1).strip()
        if k in corpus and k not in used_keys:
            used_keys.append(k)

    entries = [_bib_from_item(corpus[k]) for k in used_keys]
    entries = _dedupe_keys(entries)
    key_map = dict(zip(used_keys, (e.key for e in entries), strict=True))

    def _sub(m: re.Match[str]) -> str:
        k = m.group(1).strip()
        if k in key_map:
            return f"\\cite{{{key_map[k]}}}"
        return ""  # unknown key → strip

    new_sections = []
    for section in draft.get("sections", []):
        new_sections.append(
            {**section, "text": _PLACEHOLDER.sub(_sub, section.get("text", ""))}
        )
    new_abstract = _PLACEHOLDER.sub(_sub, draft.get("abstract_brief", ""))

    new = msg.model_copy(deep=True)
    new.payload["draft"] = {
        **draft,
        "sections": new_sections,
        "abstract_brief": new_abstract,
    }
    new.payload["citations"] = [
        {"placeholder": ph, "key": e.key, "source": "corpus"}
        for ph, e in zip(used_keys, entries, strict=True)
    ]
    new.payload["bibliography"] = format_bibtex(entries) if entries else ""

    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=f"bound {len(entries)} citations from corpus",
    )
    return new.with_record(record)
