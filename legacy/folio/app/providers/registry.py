# SPDX-License-Identifier: MPL-2.0
"""ProviderRegistry — the single point of access to LLM endpoints."""

from __future__ import annotations

from collections.abc import Iterator

from app.providers.base import Provider


class ProviderNotFoundError(KeyError):
    """Raised when a requested provider label isn't registered."""


class ProviderRegistry:
    """Process-global registry of configured providers.

    Loaded at startup from `~/.folio/config.yml` (and `.env` overrides
    in dev). Stages obtain a `Provider` by label; the routing layer
    (SAMA, M2) decides which label to use for a given stage.
    """

    def __init__(self) -> None:
        self._providers: dict[str, Provider] = {}

    def register(self, provider: Provider) -> None:
        if provider.label in self._providers:
            raise ValueError(f"provider already registered: {provider.label}")
        self._providers[provider.label] = provider

    def get(self, label: str) -> Provider:
        try:
            return self._providers[label]
        except KeyError as exc:
            raise ProviderNotFoundError(label) from exc

    def labels(self) -> tuple[str, ...]:
        return tuple(self._providers)

    def __iter__(self) -> Iterator[Provider]:
        return iter(self._providers.values())

    def __len__(self) -> int:
        return len(self._providers)
