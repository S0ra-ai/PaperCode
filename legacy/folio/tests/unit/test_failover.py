# SPDX-License-Identifier: MPL-2.0
"""Failover wrapper tests using httpx.MockTransport."""

from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from app.core.contract import Capability, CapFlag
from app.providers import (
    OpenAICompatibleProvider,
    ProviderRegistry,
    Router,
    failover_chat,
    reset_meter,
)
from app.providers.base import ChatMessage, ChatRequest
from app.providers.failover import AllProvidersFailedError


def _make_provider(
    label: str,
    handler,  # type: ignore[no-untyped-def]
    *,
    flags: set[CapFlag] | None = None,
    ctx: int | None = None,
) -> OpenAICompatibleProvider:
    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(
        base_url="http://x.test/v1",
        headers={"Authorization": "Bearer k"},
        transport=transport,
    )
    p = OpenAICompatibleProvider(
        label=label,
        base_url="http://x.test/v1",
        api_key="k",
        default_model="m",
        client=client,
    )
    p.capability = Capability(
        label=label,
        base_url="http://x.test/v1",
        default_model="m",
        flags=frozenset(flags or set()),
        context_window=ctx,
    )
    return p


def _ok(content: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "model": "m",
            "choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": 1, "completion_tokens": 2},
        },
    )


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_meter()


def test_failover_skips_5xx_and_succeeds_on_next() -> None:
    def bad_handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": "down"})

    def good_handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content.decode())
        return _ok("hello from " + body["model"])

    # Give primary the stronger capability so SAMA picks it first;
    # then verify failover hands off to backup.
    bad = _make_provider(
        "primary",
        bad_handler,
        flags={CapFlag.CHAT, CapFlag.STREAM},
        ctx=128_000,
    )
    good = _make_provider("backup", good_handler, flags={CapFlag.CHAT})
    reg = ProviderRegistry()
    reg.register(bad)
    reg.register(good)

    async def go():  # type: ignore[no-untyped-def]
        return await failover_chat(
            stage="draft",
            request=ChatRequest(
                messages=(ChatMessage(role="user", content="hi"),), model="m"
            ),
            registry=reg,
            router=Router(),
        )

    result = asyncio.run(go())
    asyncio.run(bad.aclose())
    asyncio.run(good.aclose())
    assert result.attempts == 2
    assert "primary" in result.fallbacks
    assert result.label == "backup"


def test_failover_raises_when_all_5xx() -> None:
    def bad_handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    a = _make_provider("a", bad_handler)
    b = _make_provider("b", bad_handler)
    reg = ProviderRegistry()
    reg.register(a)
    reg.register(b)

    async def go():  # type: ignore[no-untyped-def]
        return await failover_chat(
            stage="draft",
            request=ChatRequest(
                messages=(ChatMessage(role="user", content="hi"),), model="m"
            ),
            registry=reg,
            router=Router(),
        )

    with pytest.raises(AllProvidersFailedError):
        asyncio.run(go())
    asyncio.run(a.aclose())
    asyncio.run(b.aclose())


def test_failover_re_raises_non_retryable() -> None:
    def bad_handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "auth"})

    a = _make_provider("a", bad_handler)
    reg = ProviderRegistry()
    reg.register(a)

    async def go():  # type: ignore[no-untyped-def]
        return await failover_chat(
            stage="draft",
            request=ChatRequest(
                messages=(ChatMessage(role="user", content="hi"),), model="m"
            ),
            registry=reg,
            router=Router(),
        )

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(go())
    asyncio.run(a.aclose())
