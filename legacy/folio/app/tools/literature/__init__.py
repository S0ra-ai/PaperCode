# SPDX-License-Identifier: MPL-2.0
"""Literature search adapters for M6 ``survey_from_domain``.

Each adapter exposes::

    class XClient:
        async def search(query: str, *, limit: int) -> list[CorpusItem]
        async def aclose() -> None

The unified return type is ``CorpusItem`` (see
``app/core/contract/survey_types.py``). Adapters that cannot find a
field leave it ``None``/empty — later stages dedupe and back-fill.

Adapters do not raise on HTTP error; errors are converted into an
empty result plus a log line, so a single flaky source cannot tank
the whole pipeline.
"""

from __future__ import annotations

from app.tools.literature.dedupe import dedupe_merge, make_dedupe_key
from app.tools.literature.ieee_xplore import IEEEXploreClient
from app.tools.literature.openalex import OpenAlexClient
from app.tools.literature.scholar_web import ScholarWebClient
from app.tools.literature.semantic_scholar import SemanticScholarClient

__all__ = [
    "IEEEXploreClient",
    "OpenAlexClient",
    "ScholarWebClient",
    "SemanticScholarClient",
    "dedupe_merge",
    "make_dedupe_key",
]
