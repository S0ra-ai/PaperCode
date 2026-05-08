# SPDX-License-Identifier: MPL-2.0
"""ProviderRegistry + factory tests."""

from __future__ import annotations

import pytest

from app.config.loader import EndpointConfig, FolioConfig
from app.providers import (
    NoProviderConfiguredError,
    OpenAICompatibleProvider,
    build_registry,
    first_provider,
)


def _config(*labels: str) -> FolioConfig:
    return FolioConfig(
        endpoints=[
            EndpointConfig(
                label=lbl,
                base_url=f"https://example.test/{lbl}/v1",
                api_key="sk-test",
                default_model="m",
                source="test",
            )
            for lbl in labels
        ]
    )


def test_build_registry_empty() -> None:
    reg = build_registry(FolioConfig())
    assert len(reg) == 0


def test_build_registry_creates_openai_compat_only() -> None:
    reg = build_registry(_config("a", "b"))
    assert len(reg) == 2
    for p in reg:
        assert isinstance(p, OpenAICompatibleProvider)
    assert reg.labels() == ("a", "b")


def test_first_provider_picks_first() -> None:
    reg = build_registry(_config("a", "b"))
    p = first_provider(reg)
    assert p.label == "a"


def test_first_provider_raises_when_empty() -> None:
    reg = build_registry(FolioConfig())
    with pytest.raises(NoProviderConfiguredError):
        first_provider(reg)


def test_openai_provider_rejects_empty_api_key() -> None:
    with pytest.raises(ValueError, match="api_key is empty"):
        OpenAICompatibleProvider(
            label="x",
            base_url="https://example.test/v1",
            api_key="",
            default_model="m",
        )


def test_build_registry_skips_endpoints_with_empty_key() -> None:
    cfg = FolioConfig(
        endpoints=[
            EndpointConfig(
                label="good",
                base_url="https://example.test/g/v1",
                api_key="sk-real",
                default_model="m",
                source="test",
            ),
            EndpointConfig(
                label="bad",
                base_url="https://example.test/b/v1",
                api_key="   ",
                default_model="m",
                source="test",
            ),
        ]
    )
    with pytest.warns(UserWarning, match="bad"):
        reg = build_registry(cfg)
    assert reg.labels() == ("good",)


def test_build_registry_merges_secret_for_tui_endpoint(tmp_path, monkeypatch) -> None:
    """TUI endpoints persist api_key='' in YAML — secret comes from keyring."""
    monkeypatch.setenv("FOLIO_HOME", str(tmp_path))
    monkeypatch.delenv("FOLIO_LLM_ENDPOINTS", raising=False)
    from app.config import secrets

    secrets.set_secret("tuiep", "sk-from-keyring")
    try:
        cfg = FolioConfig(
            endpoints=[
                EndpointConfig(
                    label="tuiep",
                    base_url="https://example.test/v1",
                    api_key="",  # placeholder — real key in keyring
                    default_model="m",
                    source="tui",
                )
            ]
        )
        reg = build_registry(cfg)
        assert reg.labels() == ("tuiep",)
    finally:
        secrets.delete_secret("tuiep")
