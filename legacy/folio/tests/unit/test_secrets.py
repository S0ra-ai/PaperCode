# SPDX-License-Identifier: MPL-2.0
"""Tests for the secrets backend (keyring + Fernet fallback)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config import secrets as sec


@pytest.fixture
def _force_file_backend(monkeypatch: pytest.MonkeyPatch) -> None:
    """Make keyring always fail so the file backend is exercised."""
    monkeypatch.setattr(sec, "_keyring_set", lambda label, value: False)
    monkeypatch.setattr(sec, "_keyring_get", lambda label: None)
    monkeypatch.setattr(sec, "_keyring_delete", lambda label: False)
    monkeypatch.setenv(sec.PASSPHRASE_ENV, "unit-test-passphrase")


def test_set_and_get_roundtrip_file_backend(
    _isolate_folio_home: Path, _force_file_backend: None
) -> None:
    loc = sec.set_secret("openai", "sk-test")
    assert loc.backend == "file"
    assert sec.get_secret("openai") == "sk-test"


def test_delete_removes_from_file_backend(
    _isolate_folio_home: Path, _force_file_backend: None
) -> None:
    sec.set_secret("openai", "sk-test")
    assert sec.delete_secret("openai") is True
    assert sec.get_secret("openai") is None


def test_list_labels_file_backend(
    _isolate_folio_home: Path, _force_file_backend: None
) -> None:
    sec.set_secret("a", "1")
    sec.set_secret("b", "2")
    assert sec.list_labels() == ("a", "b")


def test_missing_passphrase_raises_on_write(
    _isolate_folio_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(sec, "_keyring_set", lambda label, value: False)
    monkeypatch.delenv(sec.PASSPHRASE_ENV, raising=False)
    with pytest.raises(sec.SecretBackendError):
        sec.set_secret("x", "y")


def test_keyring_path_when_available(
    _isolate_folio_home: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    store: dict[str, str] = {}
    monkeypatch.setattr(
        sec,
        "_keyring_set",
        lambda label, value: store.__setitem__(label, value) or True,
    )
    monkeypatch.setattr(sec, "_keyring_get", lambda label: store.get(label))
    monkeypatch.setattr(
        sec, "_keyring_delete", lambda label: store.pop(label, None) is not None
    )
    loc = sec.set_secret("ds", "sk-deepseek")
    assert loc.backend == "keyring"
    assert sec.get_secret("ds") == "sk-deepseek"
    assert sec.delete_secret("ds") is True
    assert sec.get_secret("ds") is None


def test_get_returns_none_when_nothing_set(
    _isolate_folio_home: Path, _force_file_backend: None
) -> None:
    assert sec.get_secret("never-stored") is None
    assert sec.list_labels() == ()
