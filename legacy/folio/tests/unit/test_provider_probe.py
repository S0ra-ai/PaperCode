# SPDX-License-Identifier: MPL-2.0
"""OpenAICompatibleProvider.probe() — feature detection without network."""

from __future__ import annotations

import asyncio
import json

import httpx

from app.core.contract import CapFlag
from app.providers import OpenAICompatibleProvider


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


def test_probe_detects_chat_and_stream() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "m"}, {"id": "m-large"}]})
        body = json.loads(req.content.decode())
        if body.get("stream"):
            return httpx.Response(
                200,
                content=b'data: {"choices":[{"delta":{"content":"x"}}]}\n\n'
                b"data: [DONE]\n\n",
            )
        return httpx.Response(
            200,
            json={
                "model": "m",
                "choices": [{"message": {"content": "ok"}}],
                "usage": {"prompt_tokens": 1, "completion_tokens": 1},
            },
        )

    p = _provider(handler)
    cap = asyncio.run(p.probe())
    asyncio.run(p.aclose())
    assert CapFlag.CHAT in cap.flags
    assert CapFlag.STREAM in cap.flags
    assert "m-large" in cap.available_models
    assert cap.last_error is None


def test_probe_records_chat_failure() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/models"):
            return httpx.Response(401, json={"error": "nope"})
        return httpx.Response(500, json={"error": "boom"})

    p = _provider(handler)
    cap = asyncio.run(p.probe())
    asyncio.run(p.aclose())
    # 500 is not an httpx.HTTPError until raise_for_status — chat path raises HTTPStatusError
    assert CapFlag.CHAT not in cap.flags
    assert cap.last_error is not None
