# SPDX-License-Identifier: MPL-2.0
"""CiteFetch placeholder substitution test (no network).

We inject fake `CrossrefClient` / `ArxivClient` to keep the test
hermetic — same intent as the cassette path, just lighter.
"""

from __future__ import annotations

import asyncio

from app.core.contract import StageMessage
from app.core.stages import cite_fetch


class FakeCrossref:
    async def search(self, query: str, *, rows: int = 5) -> list[dict]:
        return [
            {
                "title": [f"Paper for {query}"],
                "author": [{"family": "Doe", "given": "Jane"}],
                "issued": {"date-parts": [[2024]]},
                "DOI": f"10.0000/{query}",
                "container-title": ["Journal X"],
                "type": "journal-article",
            }
        ]

    async def aclose(self) -> None:
        pass


class FakeArxiv:
    async def search(self, query: str, *, max_results: int = 5):  # type: ignore[no-untyped-def]
        return []

    async def aclose(self) -> None:
        pass


def test_cite_fetch_replaces_placeholders() -> None:
    msg = StageMessage(
        payload={
            "draft": {
                "title": "T",
                "abstract_brief": "",
                "keywords": [],
                "sections": [
                    {
                        "name": "Intro",
                        "text": "See [CITE:transformer] and [CITE:transformer].",
                    },
                    {"name": "Method", "text": "Cf. [CITE:bert]."},
                ],
            }
        }
    )
    out = asyncio.run(
        cite_fetch.run(msg, crossref=FakeCrossref(), arxiv=FakeArxiv())  # type: ignore[arg-type]
    )
    sections = out.payload["draft"]["sections"]
    assert "\\cite{" in sections[0]["text"]
    assert "[CITE:" not in sections[0]["text"]
    # Same placeholder used twice → resolved once.
    assert len(out.payload["citations"]) == 2
    placeholders = {c["placeholder"] for c in out.payload["citations"]}
    assert placeholders == {"transformer", "bert"}
    assert "@article{" in out.payload["bibliography"]
