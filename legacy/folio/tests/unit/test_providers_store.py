# SPDX-License-Identifier: MPL-2.0
"""Tests for app.config.providers_store."""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from app.config import providers_store
from app.config.providers_store import ReadOnlyEndpointError, StoredEndpoint


@pytest.fixture(autouse=True)
def _master_pass(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FOLIO_MASTER_PASSPHRASE", "test-pass-123")
    # Force file-backed secrets so tests don't touch the real OS keyring.
    import keyring
    from keyring.backends.fail import Keyring as FailKeyring

    keyring.set_keyring(FailKeyring())


def test_upsert_and_get_roundtrip(_isolate_folio_home: Path) -> None:
    ep = StoredEndpoint(
        label="local",
        base_url="http://localhost:8000/v1",
        default_model="gpt-x",
        models=("gpt-x", "gpt-x-mini"),
    )
    providers_store.upsert(ep, api_key="sk-secret")

    got = providers_store.get("local")
    assert got is not None
    assert got.label == "local"
    assert got.default_model == "gpt-x"
    assert got.source == "tui"
    assert providers_store.has_secret("local")


def test_upsert_keeps_existing_key_when_none(_isolate_folio_home: Path) -> None:
    ep = StoredEndpoint(label="x", base_url="u", default_model="m")
    providers_store.upsert(ep, api_key="sk-1")
    # Update with api_key=None must keep the secret.
    providers_store.upsert(
        StoredEndpoint(label="x", base_url="u2", default_model="m2"),
        api_key=None,
    )
    from app.config import secrets

    assert secrets.get_secret("x") == "sk-1"
    got = providers_store.get("x")
    assert got is not None and got.base_url == "u2"


def test_upsert_empty_string_clears_secret(_isolate_folio_home: Path) -> None:
    providers_store.upsert(
        StoredEndpoint(label="y", base_url="u", default_model="m"), api_key="sk"
    )
    providers_store.upsert(
        StoredEndpoint(label="y", base_url="u", default_model="m"), api_key=""
    )
    assert not providers_store.has_secret("y")


def test_delete_removes_yaml_and_secret(_isolate_folio_home: Path) -> None:
    providers_store.upsert(
        StoredEndpoint(label="z", base_url="u", default_model="m"), api_key="sk"
    )
    providers_store.delete("z")
    assert providers_store.get("z") is None
    assert not providers_store.has_secret("z")


def test_env_endpoints_are_read_only(
    _isolate_folio_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FOLIO_LLM_ENDPOINTS", "envone")
    monkeypatch.setenv("FOLIO_LLM_ENVONE_BASE_URL", "https://api.example/v1")
    monkeypatch.setenv("FOLIO_LLM_ENVONE_API_KEY", "env-key")
    monkeypatch.setenv("FOLIO_LLM_ENVONE_DEFAULT_MODEL", "m")

    eps = providers_store.list_all()
    labels = {e.label: e for e in eps}
    assert labels["envone"].source == "env"

    with pytest.raises(ReadOnlyEndpointError):
        providers_store.upsert(
            StoredEndpoint(label="envone", base_url="x", default_model="m"),
            api_key="x",
        )
    with pytest.raises(ReadOnlyEndpointError):
        providers_store.delete("envone")


def test_resolve_api_key_prefers_env_then_secrets(
    _isolate_folio_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import secrets
    from app.config.loader import EndpointConfig

    secrets.set_secret("kp", "from-secrets")
    ep_no_key = EndpointConfig(
        label="kp", base_url="u", api_key="", default_model="m", source="tui"
    )
    assert providers_store.resolve_api_key(ep_no_key) == "from-secrets"

    ep_with_key = EndpointConfig(
        label="kp", base_url="u", api_key="from-env", default_model="m", source="env"
    )
    assert providers_store.resolve_api_key(ep_with_key) == "from-env"


def test_get_unknown_returns_none(_isolate_folio_home: Path) -> None:
    assert providers_store.get("nope") is None


def test_delete_unknown_is_noop(_isolate_folio_home: Path) -> None:
    providers_store.delete("nope")  # must not raise
    assert os.environ.get("FOLIO_HOME")  # sanity
