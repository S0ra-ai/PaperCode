# SPDX-License-Identifier: MPL-2.0
"""Config loader env-merge behaviour."""

from __future__ import annotations

import pytest

from app.config.loader import load


def test_load_with_no_yaml_and_no_env_returns_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for key in list(monkeypatch.delenv.__self__._setenv if False else []):  # noqa
        pass
    for key in [
        "FOLIO_LLM_ENDPOINTS",
        "FOLIO_DEBUG",
        "FOLIO_LOG_LEVEL",
        "FOLIO_LLM_TEMPERATURE",
        "FOLIO_LLM_MAX_TOKENS",
        "FOLIO_LLM_TIMEOUT",
    ]:
        monkeypatch.delenv(key, raising=False)
    cfg = load()
    assert cfg.endpoints == []
    assert cfg.debug is False


def test_endpoints_loaded_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FOLIO_LLM_ENDPOINTS", "alpha,beta")
    monkeypatch.setenv("FOLIO_LLM_ALPHA_BASE_URL", "https://a.example/v1")
    monkeypatch.setenv("FOLIO_LLM_ALPHA_API_KEY", "k1")
    monkeypatch.setenv("FOLIO_LLM_ALPHA_DEFAULT_MODEL", "m1")
    monkeypatch.setenv("FOLIO_LLM_BETA_BASE_URL", "https://b.example/v1")
    monkeypatch.setenv("FOLIO_LLM_BETA_API_KEY", "k2")
    monkeypatch.setenv("FOLIO_LLM_BETA_DEFAULT_MODEL", "m2")
    monkeypatch.setenv("FOLIO_LLM_BETA_MODELS", "m2,m2-fast")

    cfg = load()
    by_label = {e.label: e for e in cfg.endpoints}
    assert set(by_label) == {"alpha", "beta"}
    assert by_label["alpha"].source == "env"
    assert by_label["beta"].models == ("m2", "m2-fast")


def test_endpoint_missing_required_field_is_skipped(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FOLIO_LLM_ENDPOINTS", "broken")
    monkeypatch.setenv("FOLIO_LLM_BROKEN_BASE_URL", "https://x.example/v1")
    # missing API_KEY and DEFAULT_MODEL
    cfg = load()
    assert cfg.endpoints == []
