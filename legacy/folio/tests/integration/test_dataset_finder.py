# SPDX-License-Identifier: MPL-2.0
"""Cassette-backed integration test for `find_datasets`.

Records HF + arXiv responses once. Replays in CI.

Recording:

    $env:FOLIO_TEST_RECORD_MODE="true"
    uv run pytest tests/integration/test_dataset_finder.py
"""

from __future__ import annotations

from pathlib import Path

import pytest
import vcr

from app.tools.dataset_finder import find_datasets

CASSETTE_DIR = Path(__file__).parent.parent / "cassettes" / Path(__file__).stem


pytestmark = [pytest.mark.integration]


def _make_vcr(record_mode: str) -> vcr.VCR:
    return vcr.VCR(
        cassette_library_dir=str(CASSETTE_DIR),
        record_mode=record_mode,
        filter_headers=[
            ("authorization", "DUMMY"),
            ("x-api-key", "DUMMY"),
            ("cookie", "DUMMY"),
            ("set-cookie", "DUMMY"),
        ],
        decode_compressed_response=True,
    )


async def test_find_datasets_huggingface_imagenet(record_mode: str) -> None:
    cassette = "test_find_datasets_huggingface_imagenet.yaml"
    if record_mode == "none" and not (CASSETTE_DIR / cassette).exists():
        pytest.skip("no cassette recorded; run with FOLIO_TEST_RECORD_MODE=true once")

    with _make_vcr(record_mode).use_cassette(cassette):
        results = await find_datasets("imagenet", max_results=3)

    assert results, "expected at least one HF candidate for 'imagenet'"
    assert all(c.source == "huggingface" for c in results)
    assert all(c.url.startswith("https://huggingface.co/datasets/") for c in results)
    # license field is mandatory and non-empty for every candidate
    assert all(c.license for c in results)
    assert all(isinstance(c.size, str) and c.size for c in results)


async def test_find_datasets_falls_back_to_arxiv_for_unknown_query(
    record_mode: str,
) -> None:
    cassette = "test_find_datasets_falls_back_to_arxiv_for_unknown_query.yaml"
    if record_mode == "none" and not (CASSETTE_DIR / cassette).exists():
        pytest.skip("no cassette recorded; run with FOLIO_TEST_RECORD_MODE=true once")

    # A nonsense query that HF should return zero hits for, forcing the
    # arXiv fallback path. If HF starts returning matches some day,
    # update the query string.
    query = "zzqxx-no-such-dataset-9f3a2b"
    with _make_vcr(record_mode).use_cassette(cassette):
        results = await find_datasets(query, max_results=3)

    assert results, "expected at least one arxiv fallback candidate"
    assert all(c.source == "arxiv" for c in results)
    assert all(c.license for c in results)
