# SPDX-License-Identifier: MPL-2.0
"""Shared pytest fixtures."""

from __future__ import annotations

import os
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def _isolate_folio_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point FOLIO_HOME at a temp dir so tests never touch the real ~/.folio."""
    monkeypatch.setenv("FOLIO_HOME", str(tmp_path))
    return tmp_path


@pytest.fixture
def cassette_dir() -> Path:
    return Path(__file__).parent / "cassettes"


@pytest.fixture(scope="session")
def record_mode() -> str:
    """`pytest-recording` mode — `none` in CI, `new_episodes` when refreshing."""
    if os.environ.get("FOLIO_TEST_RECORD_MODE", "false").lower() in (
        "1",
        "true",
        "yes",
        "on",
    ):
        return "new_episodes"
    return "none"


@pytest.fixture(scope="session")
def vcr_config() -> dict[str, object]:
    """VCR config for `pytest-recording`.

    Strips every credential header so cassettes are always safe to
    commit. New header to scrub? Add it here, NOT case-by-case.
    """
    return {
        "filter_headers": [
            ("authorization", "DUMMY"),
            ("x-api-key", "DUMMY"),
            ("api-key", "DUMMY"),
            ("openai-api-key", "DUMMY"),
            ("cookie", "DUMMY"),
            ("set-cookie", "DUMMY"),
        ],
        "filter_query_parameters": [
            ("api_key", "DUMMY"),
            ("apikey", "DUMMY"),
            ("token", "DUMMY"),
        ],
        "decode_compressed_response": True,
    }
