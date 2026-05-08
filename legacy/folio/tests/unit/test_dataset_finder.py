# SPDX-License-Identifier: MPL-2.0
"""Unit tests for `app.tools.dataset_finder`."""

from __future__ import annotations

import json

import httpx
import pytest

from app.tools.dataset_finder import (
    ArxivDatasetClient,
    DatasetCandidate,
    HuggingFaceDatasetClient,
    _parse_license,
    find_datasets,
    to_payload,
)


def test_parse_license_picks_first_match() -> None:
    assert _parse_license(["task:nlp", "license:mit", "license:apache-2.0"]) == "mit"
    assert _parse_license(["task:vision"]) == "unknown"
    assert _parse_license([]) == "unknown"
    assert _parse_license(["License:Apache-2.0"]) == "apache-2.0"


def _hf_transport(payload: list[dict[str, object]]) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/datasets"
        assert request.url.params.get("search")
        assert request.url.params.get("full") == "true"
        return httpx.Response(200, json=payload)

    return httpx.MockTransport(handler)


async def test_huggingface_search_parses_license_and_size() -> None:
    transport = _hf_transport(
        [
            {
                "id": "ILSVRC/imagenet-1k",
                "tags": ["task:image-classification", "license:other"],
                "downloads": 116399,
            },
            {
                "id": "no-license-dataset",
                "tags": ["modality:text"],
                "downloads": 42,
            },
            {"not_a_dict": True},
        ]
    )
    client = HuggingFaceDatasetClient(
        client=httpx.AsyncClient(base_url="https://huggingface.co", transport=transport)
    )
    results = await client.search("imagenet", max_results=5)
    await client.aclose()

    assert len(results) == 2
    assert results[0] == DatasetCandidate(
        name="ILSVRC/imagenet-1k",
        url="https://huggingface.co/datasets/ILSVRC/imagenet-1k",
        license="other",
        size="116,399 downloads",
        source="huggingface",
    )
    assert results[1].license == "unknown"
    assert results[1].size == "42 downloads"


async def test_huggingface_search_handles_non_list_response() -> None:
    transport = httpx.MockTransport(
        lambda request: httpx.Response(200, json={"error": "rate limited"})
    )
    client = HuggingFaceDatasetClient(
        client=httpx.AsyncClient(base_url="https://huggingface.co", transport=transport)
    )
    assert await client.search("anything") == []
    await client.aclose()


async def test_huggingface_search_respects_max_results() -> None:
    transport = _hf_transport(
        [{"id": f"ds/{i}", "tags": ["license:mit"], "downloads": i} for i in range(10)]
    )
    client = HuggingFaceDatasetClient(
        client=httpx.AsyncClient(base_url="https://huggingface.co", transport=transport)
    )
    results = await client.search("x", max_results=3)
    await client.aclose()
    assert len(results) == 3


async def test_find_datasets_falls_back_to_arxiv_when_hf_empty() -> None:
    hf = HuggingFaceDatasetClient(
        client=httpx.AsyncClient(
            base_url="https://huggingface.co",
            transport=httpx.MockTransport(lambda request: httpx.Response(200, json=[])),
        )
    )

    arxiv_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <id>http://arxiv.org/abs/2401.00001v1</id>
        <title>A Toy Dataset for Things</title>
        <summary>desc</summary>
        <published>2024-01-01T00:00:00Z</published>
        <author><name>Alice</name></author>
        <link href="http://arxiv.org/pdf/2401.00001v1" type="application/pdf"/>
      </entry>
    </feed>"""

    from app.core.citations.arxiv import ArxivClient

    arxiv = ArxivDatasetClient(
        client=ArxivClient(
            client=httpx.AsyncClient(
                base_url="https://export.arxiv.org",
                transport=httpx.MockTransport(
                    lambda request: httpx.Response(200, text=arxiv_xml)
                ),
            )
        )
    )

    results = await find_datasets("toy", max_results=5, hf=hf, arxiv=arxiv)
    assert len(results) == 1
    assert results[0].source == "arxiv"
    assert results[0].name == "arxiv:2401.00001v1"
    assert results[0].license == "unknown"


async def test_find_datasets_returns_hf_when_present_and_skips_arxiv() -> None:
    hf = HuggingFaceDatasetClient(
        client=httpx.AsyncClient(
            base_url="https://huggingface.co",
            transport=_hf_transport(
                [{"id": "x/y", "tags": ["license:cc-by-4.0"], "downloads": 1}]
            ),
        )
    )
    arxiv_calls = 0

    def arxiv_handler(request: httpx.Request) -> httpx.Response:
        nonlocal arxiv_calls
        arxiv_calls += 1
        return httpx.Response(500)

    from app.core.citations.arxiv import ArxivClient

    arxiv = ArxivDatasetClient(
        client=ArxivClient(
            client=httpx.AsyncClient(
                base_url="https://export.arxiv.org",
                transport=httpx.MockTransport(arxiv_handler),
            )
        )
    )

    results = await find_datasets("x", hf=hf, arxiv=arxiv)
    assert len(results) == 1
    assert results[0].license == "cc-by-4.0"
    assert arxiv_calls == 0


async def test_find_datasets_raises_when_both_fail() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="upstream down")

    hf = HuggingFaceDatasetClient(
        client=httpx.AsyncClient(
            base_url="https://huggingface.co",
            transport=httpx.MockTransport(boom),
        )
    )
    from app.core.citations.arxiv import ArxivClient

    arxiv = ArxivDatasetClient(
        client=ArxivClient(
            client=httpx.AsyncClient(
                base_url="https://export.arxiv.org",
                transport=httpx.MockTransport(boom),
            )
        )
    )
    with pytest.raises(RuntimeError, match="both sources failed"):
        await find_datasets("anything", hf=hf, arxiv=arxiv)


def test_to_payload_round_trip() -> None:
    cands = [
        DatasetCandidate(
            name="x/y",
            url="https://huggingface.co/datasets/x/y",
            license="mit",
            size="100 downloads",
            source="huggingface",
        )
    ]
    payload = to_payload(cands)
    assert payload == [
        {
            "name": "x/y",
            "url": "https://huggingface.co/datasets/x/y",
            "license": "mit",
            "size": "100 downloads",
            "source": "huggingface",
        }
    ]
    # JSON-serialisable
    assert json.loads(json.dumps(payload)) == payload
