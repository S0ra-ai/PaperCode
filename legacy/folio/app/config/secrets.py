# SPDX-License-Identifier: MPL-2.0
"""Secret store — keyring first, encrypted file fallback.

Used by anything that writes user-supplied credentials (API keys for
TUI-managed endpoints, etc). Single entry point so we never sprinkle
keyring imports across the codebase.

Fallback rationale: ``keyring`` is unreliable on headless Linux and in
some Windows contexts; when it raises we transparently degrade to a
Fernet-encrypted blob at ``~/.folio/secrets.enc`` keyed by a master
password (env var ``FOLIO_MASTER_PASSPHRASE`` for non-interactive
contexts; the TUI prompts for it on first run).
"""

from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.config.loader import folio_home

KEYRING_SERVICE = "folio"
SECRETS_FILENAME = "secrets.enc"
SALT_FILENAME = "secrets.salt"
PASSPHRASE_ENV = "FOLIO_MASTER_PASSPHRASE"


class SecretBackendError(RuntimeError):
    """Raised when no usable secret backend is available."""


# ---------------- keyring backend ----------------


def _keyring_set(label: str, value: str) -> bool:
    try:
        import keyring  # local import: optional path

        keyring.set_password(KEYRING_SERVICE, label, value)
        return True
    except Exception:
        return False


def _keyring_get(label: str) -> str | None:
    try:
        import keyring

        return keyring.get_password(KEYRING_SERVICE, label)
    except Exception:
        return None


def _keyring_delete(label: str) -> bool:
    try:
        import keyring

        keyring.delete_password(KEYRING_SERVICE, label)
        return True
    except Exception:
        return False


# ---------------- Fernet fallback ----------------


def _secrets_path() -> Path:
    return folio_home() / SECRETS_FILENAME


def _salt_path() -> Path:
    return folio_home() / SALT_FILENAME


def _load_or_create_salt() -> bytes:
    p = _salt_path()
    if p.exists():
        return p.read_bytes()
    salt = os.urandom(16)
    p.write_bytes(salt)
    return salt


def _derive_key(passphrase: str) -> bytes:
    salt = _load_or_create_salt()
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=200_000,
    )
    return base64.urlsafe_b64encode(kdf.derive(passphrase.encode("utf-8")))


def _passphrase() -> str:
    pw = os.environ.get(PASSPHRASE_ENV)
    if not pw:
        raise SecretBackendError(
            f"No passphrase available; set ${PASSPHRASE_ENV} or use keyring backend."
        )
    return pw


def _read_blob() -> dict[str, str]:
    p = _secrets_path()
    if not p.exists():
        return {}
    f = Fernet(_derive_key(_passphrase()))
    try:
        decoded = f.decrypt(p.read_bytes())
    except InvalidToken as exc:
        raise SecretBackendError(
            "secrets.enc cannot be decrypted with current passphrase"
        ) from exc
    parsed = json.loads(decoded.decode("utf-8"))
    return {str(k): str(v) for k, v in parsed.items()}


def _write_blob(blob: dict[str, str]) -> None:
    f = Fernet(_derive_key(_passphrase()))
    payload = json.dumps(blob, sort_keys=True).encode("utf-8")
    _secrets_path().write_bytes(f.encrypt(payload))


# ---------------- public API ----------------


@dataclass(frozen=True)
class SecretLocation:
    backend: str  # "keyring" | "file"
    label: str


def set_secret(label: str, value: str) -> SecretLocation:
    """Store ``value`` under ``label``. Returns where it landed."""
    if _keyring_set(label, value):
        return SecretLocation(backend="keyring", label=label)
    blob = _read_blob() if _secrets_path().exists() else {}
    blob[label] = value
    _write_blob(blob)
    return SecretLocation(backend="file", label=label)


def get_secret(label: str) -> str | None:
    """Look up ``label`` — keyring first, file second."""
    v = _keyring_get(label)
    if v is not None:
        return v
    if not _secrets_path().exists():
        return None
    try:
        return _read_blob().get(label)
    except SecretBackendError:
        return None


def delete_secret(label: str) -> bool:
    """Remove ``label`` from whichever backend has it. Returns True if found."""
    found = False
    if _keyring_get(label) is not None and _keyring_delete(label):
        found = True
    if _secrets_path().exists():
        try:
            blob = _read_blob()
        except SecretBackendError:
            return found
        if label in blob:
            blob.pop(label)
            _write_blob(blob)
            found = True
    return found


def list_labels() -> tuple[str, ...]:
    """List labels stored in the file backend (keyring is opaque)."""
    if not _secrets_path().exists():
        return ()
    try:
        return tuple(sorted(_read_blob()))
    except SecretBackendError:
        return ()
