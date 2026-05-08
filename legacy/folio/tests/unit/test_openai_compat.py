# SPDX-License-Identifier: MPL-2.0
"""OpenAICompatibleProvider unit tests using httpx MockTransport (no network)."""

from __future__ import annotations

import asyncio
import json

import httpx

from app.providers import (
    ChatMessage,
    ChatRequest,
    OpenAICompatibleProvider,
)


def _provider(handler) -> OpenAICompatibleProvider:  # type: ignore[no-untyped-def]
    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(
        base_url="http://x.test/v1",
        headers={"Authorization": "Bearer k"},
        transport=transport,
    )
    return OpenAICompatibleProvider(
        label="t",
        base_url="http://x.test/v1",
        api_key="k",
        default_model="m",
        client=client,
    )


def test_chat_round_trip() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content.decode())
        assert body["model"] == "m"
        assert body["messages"][0]["role"] == "user"
        return httpx.Response(
            200,
            json={
                "model": "m-server",
                "choices": [{"message": {"content": "hi"}}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 1},
            },
        )

    p = _provider(handler)
    resp = asyncio.run(
        p.chat(
            ChatRequest(
                messages=(ChatMessage(role="user", content="hello"),),
                model="m",
            )
        )
    )
    asyncio.run(p.aclose())
    assert resp.content == "hi"
    assert resp.model == "m-server"
    assert resp.prompt_tokens == 3


def test_stream_parses_sse() -> None:
    chunks = [
        b'data: {"choices":[{"delta":{"content":"he"}}]}\n\n',
        b'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
        b"data: [DONE]\n\n",
    ]

    def handler(req: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"".join(chunks))

    p = _provider(handler)

    async def collect() -> list[str]:
        out = []
        async for piece in p.stream(
            ChatRequest(
                messages=(ChatMessage(role="user", content="hi"),),
                model="m",
                stream=True,
            )
        ):
            out.append(piece)
        return out

    pieces = asyncio.run(collect())
    asyncio.run(p.aclose())
    assert pieces == ["he", "llo"]
