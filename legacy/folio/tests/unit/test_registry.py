# SPDX-License-Identifier: MPL-2.0
"""ProviderRegistry behaviour tests (no real HTTP)."""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest

from app.core.contract import Capability, CapFlag
from app.providers import (
    ChatRequest,
    ChatResponse,
    Provider,
    ProviderNotFoundError,
    ProviderRegistry,
)


class _StubProvider(Provider):
    """Test-only stub. NOT a MockProvider for runtime use — exists purely
    to verify registry plumbing without touching the network."""

    def __init__(self, label: str) -> None:
        self.label = label
        self.capability = Capability(
            label=label,
            base_url="https://stub.invalid/v1",
            default_model="stub",
            flags=frozenset({CapFlag.CHAT}),
        )

    async def chat(self, request: ChatRequest) -> ChatResponse:  # pragma: no cover
        raise NotImplementedError

    async def stream(
        self, request: ChatRequest
    ) -> AsyncIterator[str]:  # pragma: no cover
        raise NotImplementedError
        yield ""  # noqa: unreachable

    async def probe(self) -> Capability:  # pragma: no cover
        return self.capability


def test_register_and_get() -> None:
    reg = ProviderRegistry()
    p = _StubProvider("primary")
    reg.register(p)
    assert reg.get("primary") is p
    assert reg.labels() == ("primary",)
    assert len(reg) == 1


def test_duplicate_register_raises() -> None:
    reg = ProviderRegistry()
    reg.register(_StubProvider("a"))
    with pytest.raises(ValueError):
        reg.register(_StubProvider("a"))


def test_missing_provider_raises_typed_error() -> None:
    reg = ProviderRegistry()
    with pytest.raises(ProviderNotFoundError):
        reg.get("nope")
