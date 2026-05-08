# SPDX-License-Identifier: MPL-2.0
"""Unit tests for the on-demand tectonic installer."""

from __future__ import annotations

import io
import sys
import tarfile
import zipfile
from pathlib import Path

import pytest

from app.sandbox import tectonic_installer


def _fake_payload(binary_name: str, asset: str) -> bytes:
    """Build a tiny zip/tarball containing a fake tectonic binary."""

    body = b"#!/bin/sh\necho fake-tectonic\n"
    if asset.endswith(".zip"):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(f"tectonic-x/{binary_name}", body)
        return buf.getvalue()
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tf:
        info = tarfile.TarInfo(name=f"tectonic-x/{binary_name}")
        info.size = len(body)
        info.mode = 0o755
        tf.addfile(info, io.BytesIO(body))
    return buf.getvalue()


def test_installed_path_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))  # type: ignore[arg-type]
    assert tectonic_installer.installed_path() is None


def test_discover_falls_back_to_path(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))  # type: ignore[arg-type]
    monkeypatch.setattr(
        tectonic_installer.shutil, "which", lambda _name: "/usr/bin/tectonic"
    )
    found = tectonic_installer.discover()
    assert found is not None
    assert found.name in ("tectonic", "tectonic.exe")
    assert "tectonic" in str(found)


def test_asset_name_known_platform() -> None:
    name = tectonic_installer._asset_name("0.16.9")
    assert name is not None
    assert "0.16.9" in name


def test_release_url_encodes_at_sign() -> None:
    url = tectonic_installer._release_url(
        "0.16.9", "tectonic-0.16.9-x86_64-pc-windows-msvc.zip"
    )
    assert "tectonic%400.16.9" in url
    assert "@" not in url.split("/download/")[1].split("/")[0]


def test_ensure_no_auto_returns_none_when_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))  # type: ignore[arg-type]
    monkeypatch.setattr(tectonic_installer.shutil, "which", lambda _name: None)
    assert tectonic_installer.ensure_tectonic(auto=False) is None


def test_ensure_downloads_and_extracts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))  # type: ignore[arg-type]
    monkeypatch.setattr(tectonic_installer.shutil, "which", lambda _name: None)

    asset = tectonic_installer._asset_name(tectonic_installer.DEFAULT_VERSION)
    assert asset is not None, "test platform unsupported by installer"
    binary = tectonic_installer._binary_name()
    payload = _fake_payload(binary, asset)

    monkeypatch.setattr(
        tectonic_installer, "_download", lambda _url, timeout=90.0: payload
    )

    result = tectonic_installer.ensure_tectonic(auto=True)
    assert result is not None
    assert result.name == binary
    assert result.exists()
    assert result.read_bytes().startswith(
        b"#!/bin/sh"
    ) or result.read_bytes().startswith(b"#!")
    if sys.platform != "win32":
        assert result.stat().st_mode & 0o111, "binary should be executable on POSIX"


def test_ensure_returns_none_when_download_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(Path, "home", classmethod(lambda cls: tmp_path))  # type: ignore[arg-type]
    monkeypatch.setattr(tectonic_installer.shutil, "which", lambda _name: None)
    monkeypatch.setattr(
        tectonic_installer, "_download", lambda _url, timeout=90.0: None
    )
    assert tectonic_installer.ensure_tectonic(auto=True) is None
