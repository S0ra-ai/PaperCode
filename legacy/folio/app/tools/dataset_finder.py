# SPDX-License-Identifier: MPL-2.0
"""Dataset finder — locate candidate datasets for an experiment.

Sources (in priority order):
1. **HuggingFace Hub** (`/api/datasets?search=...`) — primary; returns
   structured `tags` from which we parse the SPDX-ish license string.
2. **arXiv** — secondary; mines paper abstracts for dataset mentions.
   Coarse, used as a fallback when HF returns nothing.

License is **mandatory** in the candidate. When a source omits it, we
emit ``"unknown"`` and leave the gating decision to downstream license
checking (`app/tools/license.py` in M4).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.citations.arxiv import ArxivClient

HF_BASE = "https://huggingface.co"


@dataclass(frozen=True)
class DatasetCandidate:
    """A single dataset suggestion.

    Attributes
    ----------
    name : str
        Stable identifier (e.g. ``"ILSVRC/imagenet-1k"`` for HF, or an
        arXiv ID for paper-derived candidates).
    url : str
        Canonical landing URL.
    license : str
        SPDX-ish identifier or ``"unknown"`` if the source did not
        report one. Never empty.
    size : str
        Free-form size descriptor (downloads, row count, ``"unknown"``).
        Cardinality varies per source — do not parse it numerically
        without first inspecting `source`.
    source : str
        ``"huggingface"`` | ``"arxiv"``.
    """

    name: str
    url: str
    license: str
    size: str
    source: str


_LICENSE_TAG_RE = re.compile(r"^license:(.+)$", re.IGNORECASE)


def _parse_license(tags: list[str]) -> str:
    for tag in tags:
        m = _LICENSE_TAG_RE.match(tag)
        if m:
            return m.group(1).strip().lower()
    return "unknown"


class HuggingFaceDatasetClient:
    """Async client for `https://huggingface.co/api/datasets`."""

    def __init__(
        self,
        *,
        base_url: str = HF_BASE,
        timeout: float = 30.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self._base = base_url.rstrip("/")
        self._timeout = timeout
        self._client = client

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(base_url=self._base, timeout=self._timeout)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def search(
        self, query: str, *, max_results: int = 5
    ) -> list[DatasetCandidate]:
        resp = await self._http().get(
            "/api/datasets",
            params={"search": query, "limit": str(max_results), "full": "true"},
        )
        resp.raise_for_status()
        data = resp.json()
        if not isinstance(data, list):
            return []
        out: list[DatasetCandidate] = []
        for item in data[:max_results]:
            if not isinstance(item, dict):
                continue
            name = str(item.get("id") or "").strip()
            if not name:
                continue
            tags_raw = item.get("tags") or []
            tags = [str(t) for t in tags_raw if isinstance(t, (str, int, float))]
            downloads = item.get("downloads")
            size = (
                f"{int(downloads):,} downloads"
                if isinstance(downloads, (int, float))
                else "unknown"
            )
            out.append(
                DatasetCandidate(
                    name=name,
                    url=f"{self._base}/datasets/{name}",
                    license=_parse_license(tags),
                    size=size,
                    source="huggingface",
                )
            )
        return out


class ArxivDatasetClient:
    """Mine arXiv abstracts for dataset-shaped mentions.

    The arXiv API doesn't expose datasets as first-class objects, so
    this is best-effort: each hit is converted into a `DatasetCandidate`
    with the *paper* as the dataset proxy. License is always ``"unknown"``
    — the paper's license is unrelated to its referenced corpora.
    """

    def __init__(self, client: ArxivClient | None = None) -> None:
        self._client = client or ArxivClient()
        self._owned = client is None

    async def aclose(self) -> None:
        if self._owned:
            await self._client.aclose()

    async def search(
        self, query: str, *, max_results: int = 3
    ) -> list[DatasetCandidate]:
        entries = await self._client.search(f"{query} dataset", max_results=max_results)
        out: list[DatasetCandidate] = []
        for entry in entries:
            url = entry.pdf_url or f"https://arxiv.org/abs/{entry.arxiv_id}"
            out.append(
                DatasetCandidate(
                    name=f"arxiv:{entry.arxiv_id}",
                    url=url,
                    license="unknown",
                    size="unknown",
                    source="arxiv",
                )
            )
        return out


async def find_datasets(
    query: str,
    *,
    max_results: int = 5,
    hf: HuggingFaceDatasetClient | None = None,
    arxiv: ArxivDatasetClient | None = None,
) -> list[DatasetCandidate]:
    """Aggregate candidates from HuggingFace + arXiv.

    HuggingFace results come first. arXiv is invoked only when HF
    returns nothing, to keep results focused. Network errors from one
    source are swallowed (the other source still gets a chance) but
    propagate if **both** sources fail.
    """
    hf_owned = hf is None
    arxiv_owned = arxiv is None
    hf = hf or HuggingFaceDatasetClient()
    arxiv = arxiv or ArxivDatasetClient()

    hf_results: list[DatasetCandidate] = []
    hf_error: Exception | None = None
    try:
        hf_results = await hf.search(query, max_results=max_results)
    except (httpx.HTTPError, ValueError) as exc:
        hf_error = exc

    if hf_results:
        results = hf_results
    else:
        try:
            results = await arxiv.search(query, max_results=min(max_results, 3))
        except (httpx.HTTPError, ValueError) as exc:
            if hf_error is not None:
                raise RuntimeError(
                    f"dataset_finder: both sources failed (hf={hf_error!r}, arxiv={exc!r})"
                ) from exc
            raise

    if hf_owned:
        await hf.aclose()
    if arxiv_owned:
        await arxiv.aclose()
    return results[:max_results]


def to_payload(candidates: list[DatasetCandidate]) -> list[dict[str, Any]]:
    """JSON-serialisable view for `StageMessage.payload`."""
    return [
        {
            "name": c.name,
            "url": c.url,
            "license": c.license,
            "size": c.size,
            "source": c.source,
        }
        for c in candidates
    ]
