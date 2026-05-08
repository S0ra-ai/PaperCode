# SPDX-License-Identifier: MPL-2.0
"""Persistent storage for TUI-managed providers.

Splits responsibility between three places:

- ``~/.folio/config.yml`` — non-secret endpoint metadata (label,
  base_url, default_model, models). Loaded by ``app.config.loader``.
- ``app.config.secrets`` — API keys (keyring or Fernet fallback).
- Process env — ``FOLIO_LLM_*`` vars; these are read-only from the TUI's
  perspective and rendered with a ``(env)`` tag.

This module is the single entry point the TUI uses to mutate the
provider list. It never imports textual; it can be unit-tested headless.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from app.config import secrets
from app.config.loader import EndpointConfig, FolioConfig, folio_home, load
from app.core.contract import Capability

CONFIG_FILENAME = "config.yml"


class ReadOnlyEndpointError(RuntimeError):
    """Raised when the TUI tries to mutate an env-sourced endpoint."""


@dataclass(frozen=True)
class StoredEndpoint:
    label: str
    base_url: str
    default_model: str
    models: tuple[str, ...] = ()
    source: str = "tui"  # "tui" | "env" | "config"


def _config_path() -> Path:
    return folio_home() / CONFIG_FILENAME


def _read_yaml() -> dict[str, object]:
    path = _config_path()
    if not path.exists():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(raw, dict):
        raise ValueError(f"{CONFIG_FILENAME} must be a mapping")
    return raw


def _write_yaml(data: dict[str, object]) -> None:
    _config_path().write_text(
        yaml.safe_dump(data, sort_keys=True, allow_unicode=True),
        encoding="utf-8",
    )


def _yaml_endpoints(data: dict[str, object]) -> list[dict[str, object]]:
    raw = data.get("endpoints", [])
    if not isinstance(raw, list):
        return []
    out: list[dict[str, object]] = []
    for item in raw:
        if isinstance(item, dict):
            out.append(dict(item))
    return out


# ---------------- public API ----------------


def list_all() -> tuple[StoredEndpoint, ...]:
    """List endpoints from both config.yml and env, env wins on label clash."""
    cfg: FolioConfig = load()
    out: dict[str, StoredEndpoint] = {}
    for ep in cfg.endpoints:
        out[ep.label] = StoredEndpoint(
            label=ep.label,
            base_url=ep.base_url,
            default_model=ep.default_model,
            models=tuple(ep.models),
            source=ep.source,
        )
    return tuple(sorted(out.values(), key=lambda e: e.label))


def get(label: str) -> StoredEndpoint | None:
    for ep in list_all():
        if ep.label == label:
            return ep
    return None


def has_secret(label: str) -> bool:
    return secrets.get_secret(label) is not None


def upsert(endpoint: StoredEndpoint, *, api_key: str | None) -> None:
    """Insert or update a TUI-managed endpoint.

    ``api_key=None`` means *don't touch the existing secret*; use
    ``api_key=""`` to explicitly clear it.
    """
    existing = get(endpoint.label)
    if existing is not None and existing.source == "env":
        raise ReadOnlyEndpointError(
            f"endpoint {endpoint.label!r} comes from environment; "
            "edit your .env / shell to change it."
        )

    data = _read_yaml()
    eps = _yaml_endpoints(data)
    eps = [e for e in eps if e.get("label") != endpoint.label]
    eps.append(
        {
            "label": endpoint.label,
            "base_url": endpoint.base_url,
            "api_key": "",  # secret lives in the secrets backend; placeholder for schema
            "default_model": endpoint.default_model,
            "models": list(endpoint.models),
            "source": "tui",
        }
    )
    data["endpoints"] = eps
    _write_yaml(data)

    if api_key is not None:
        if api_key == "":
            secrets.delete_secret(endpoint.label)
        else:
            secrets.set_secret(endpoint.label, api_key)


def delete(label: str) -> None:
    existing = get(label)
    if existing is None:
        return
    if existing.source == "env":
        raise ReadOnlyEndpointError(
            f"endpoint {label!r} comes from environment; cannot delete via TUI."
        )
    data = _read_yaml()
    eps = _yaml_endpoints(data)
    data["endpoints"] = [e for e in eps if e.get("label") != label]
    _write_yaml(data)
    secrets.delete_secret(label)


async def probe(label: str) -> Capability:
    """Construct a transient provider for ``label`` and call ``probe()``."""
    ep = get(label)
    if ep is None:
        raise KeyError(label)
    api_key = secrets.get_secret(label) or ""

    # Local imports keep this module free of provider deps for headless tests.
    from app.providers.openai_compat import OpenAICompatibleProvider

    provider = OpenAICompatibleProvider(
        label=label,
        base_url=ep.base_url,
        api_key=api_key,
        default_model=ep.default_model,
        models=ep.models,
    )
    try:
        return await provider.probe()
    finally:
        await provider.aclose()


def resolve_api_key(endpoint: EndpointConfig) -> str:
    """Get the runtime API key for an endpoint (env value first, then secrets)."""
    if endpoint.api_key:
        return endpoint.api_key
    return secrets.get_secret(endpoint.label) or ""
