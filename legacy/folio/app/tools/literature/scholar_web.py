# SPDX-License-Identifier: MPL-2.0
"""Google Scholar web adapter — STUB.

The real adapter would go through ``playwright-MCP`` with explicit
user consent, because scraping scholar.google.com violates Google's
ToS and triggers CAPTCHAs. Until that exists this stub keeps the
interface stable: ``search`` returns ``[]`` and logs a warning when
enabled.
"""

from __future__ import annotations

import logging

from app.core.contract.survey_types import CorpusItem

log = logging.getLogger(__name__)


class ScholarWebClient:
    def __init__(self, *, enabled: bool = False) -> None:
        self._enabled = enabled

    async def aclose(self) -> None:
        return None

    async def search(self, query: str, *, limit: int = 20) -> list[CorpusItem]:
        if not self._enabled:
            return []
        log.warning(
            "scholar_web is enabled but the real adapter is not implemented; "
            "returning []. See docs/surveys.md for the ToS context."
        )
        return []


__all__ = ["ScholarWebClient"]
