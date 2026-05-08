# SPDX-License-Identifier: MPL-2.0
"""PdfOnDemandStage — download PDF full-text for top-K per cluster.

Uses ``item.pdf_url`` (when present) to fetch the file, extract text
via ``app.tools.pdf_ingest``, and stash the first N characters back on
``CorpusItem.full_text``. A failed fetch is a soft failure: the item's
``full_text`` stays ``None`` and draft-stage will fall back to the
abstract.

The stage honours:
* ``cfg.pdf_on_demand_enabled`` — if False, no-op.
* ``cfg.pdf_on_demand_top_k`` — per-branch (or global if no taxonomy yet)
  cap.
* A global 3-minute wall-clock cap to protect the pipeline from a slow
  origin.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import tempfile
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

import httpx

from app.config.survey import SurveyConfig
from app.core.contract import StageMessage, StageRecord
from app.core.contract.survey_types import CorpusItem, Taxonomy
from app.tools.pdf_ingest import extract

log = logging.getLogger(__name__)

STAGE = "pdf_on_demand"

_MAX_CHARS = 40_000  # keep prompt footprint bounded


def _select_targets(
    corpus: list[CorpusItem],
    taxonomy: Taxonomy | None,
    *,
    top_k: int,
) -> list[str]:
    """Pick which corpus keys to download."""

    if taxonomy and taxonomy.branches:
        index: dict[str, CorpusItem] = {i.key: i for i in corpus}
        targets: list[str] = []
        for branch in taxonomy.branches:
            members = [index[k] for k in branch.members if k in index]
            members.sort(key=lambda i: i.relevance_score, reverse=True)
            for m in members[:top_k]:
                if m.pdf_url and m.key not in targets:
                    targets.append(m.key)
        return targets
    # No taxonomy yet: global top-k across the corpus.
    ordered = sorted(corpus, key=lambda i: i.relevance_score, reverse=True)
    return [i.key for i in ordered if i.pdf_url][:top_k]


async def _fetch_one(
    http: httpx.AsyncClient, item: CorpusItem
) -> tuple[str, str | None, str | None]:
    assert item.pdf_url
    try:
        resp = await http.get(item.pdf_url, follow_redirects=True, timeout=30.0)
        resp.raise_for_status()
        data = resp.content
    except Exception as exc:
        log.warning("pdf fetch failed for %s: %s", item.key, exc)
        return item.key, None, None
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
        fh.write(data)
        tmp_path = Path(fh.name)
    try:
        text = extract(tmp_path).text[:_MAX_CHARS]
    except Exception as exc:
        log.warning("pdf extract failed for %s: %s", item.key, exc)
        text = None
    finally:
        with contextlib.suppress(OSError):
            tmp_path.unlink()
    source = "arxiv" if "arxiv" in (item.pdf_url or "") else "unpaywall"
    return item.key, text, source


async def run(
    msg: StageMessage,
    *,
    config: SurveyConfig | None = None,
    http: httpx.AsyncClient | None = None,
) -> StageMessage:
    started = datetime.now(UTC)
    cfg = config or SurveyConfig()
    corpus = [CorpusItem.model_validate(c) for c in msg.payload.get("corpus", [])]
    taxonomy_raw = msg.payload.get("taxonomy")
    taxonomy = Taxonomy.model_validate(taxonomy_raw) if taxonomy_raw else None

    if not cfg.pdf_on_demand_enabled or not corpus:
        new = msg.model_copy(deep=True)
        record = StageRecord(
            stage=STAGE,
            started_at=started,
            finished_at=datetime.now(UTC),
            note="skipped (disabled or empty corpus)",
        )
        return new.with_record(record)

    targets = _select_targets(corpus, taxonomy, top_k=cfg.pdf_on_demand_top_k)
    own_http = http is None
    http = http or httpx.AsyncClient(
        timeout=30.0, headers={"User-Agent": "Folio/0.1 (survey)"}
    )

    fetched: dict[str, tuple[str | None, str | None]] = {}
    try:
        index = {i.key: i for i in corpus}
        coros: Iterable[asyncio.Task[tuple[str, str | None, str | None]]] = [
            asyncio.create_task(_fetch_one(http, index[k])) for k in targets
        ]
        try:
            done = await asyncio.wait_for(asyncio.gather(*coros), timeout=180.0)
        except TimeoutError:
            log.warning("pdf_on_demand hit global timeout; cancelling")
            for t in coros:
                t.cancel()
            done = []
        for key, text, source in done:
            fetched[key] = (text, source)
    finally:
        if own_http:
            await http.aclose()

    succeeded = 0
    patched: list[CorpusItem] = []
    for item in corpus:
        text, source = fetched.get(item.key, (None, None))
        if text:
            succeeded += 1
            patched.append(
                item.model_copy(
                    update={
                        "full_text": text,
                        "full_text_source": source or "none",
                    }
                )
            )
        else:
            patched.append(item)

    new = msg.model_copy(deep=True)
    new.payload["corpus"] = [i.model_dump() for i in patched]
    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=f"attempted={len(targets)} fetched={succeeded}",
    )
    return new.with_record(record)
