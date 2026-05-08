# SPDX-License-Identifier: MPL-2.0
"""OpenAI-compatible LLM provider.

The **only** concrete provider in Folio. Speaks OpenAI Chat
Completions v1 over HTTP — anything that implements that protocol
(OpenAI, Azure, OpenRouter, DeepSeek, Ollama, vLLM, ...) plugs in
behind the same adapter. No vendor branches anywhere.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import AsyncIterator
from dataclasses import asdict
from datetime import UTC
from typing import Any

import httpx

from app.core.contract import Capability, CapFlag
from app.observability.trace import TraceEvent
from app.observability.trace import write as write_trace
from app.providers.base import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    Provider,
)


def _hash(payload: object) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, default=str).encode("utf-8")
    ).hexdigest()[:16]


class OpenAICompatibleProvider(Provider):
    """HTTP adapter for any OpenAI Chat Completions v1 endpoint."""

    def __init__(
        self,
        *,
        label: str,
        base_url: str,
        api_key: str,
        default_model: str,
        models: tuple[str, ...] = (),
        headers: dict[str, str] | None = None,
        timeout: float = 300.0,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.label = label
        self._base_url = base_url.rstrip("/")
        api_key = (api_key or "").strip()
        if not api_key:
            raise ValueError(
                f"provider '{label}': api_key is empty. "
                "Set it via folio init / :endpoints, or via "
                f"FOLIO_LLM_{label.upper()}_API_KEY in the environment."
            )
        self._api_key = api_key
        self._default_model = default_model
        self._extra_headers = dict(headers or {})
        self._timeout = timeout
        self._client = client
        self.capability = Capability(
            label=label,
            base_url=self._base_url,
            default_model=default_model,
            available_models=tuple(models),
        )

    # ---- internals ----

    def _http(self) -> httpx.AsyncClient:
        if self._client is not None:
            return self._client
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._auth_headers(),
            timeout=self._timeout,
        )
        return self._client

    def _auth_headers(self) -> dict[str, str]:
        h = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        h.update(self._extra_headers)
        return h

    def _payload(self, request: ChatRequest, *, stream: bool) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": request.model or self._default_model,
            "messages": [asdict(m) for m in request.messages],
            "temperature": request.temperature,
            "stream": stream,
        }
        if request.max_tokens is not None:
            body["max_tokens"] = request.max_tokens
        if request.tools:
            body["tools"] = list(request.tools)
        if request.response_format is not None:
            body["response_format"] = request.response_format
        return body

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    # ---- Provider interface ----

    async def chat(self, request: ChatRequest) -> ChatResponse:
        body = self._payload(request, stream=False)
        t0 = time.perf_counter()
        resp = await self._http().post("/chat/completions", json=body)
        latency_ms = int((time.perf_counter() - t0) * 1000)
        resp.raise_for_status()
        data = resp.json()
        choice = data["choices"][0]
        content = choice["message"]["content"] or ""
        usage = data.get("usage") or {}
        out = ChatResponse(
            content=content,
            model=data.get("model", body["model"]),
            prompt_tokens=int(usage.get("prompt_tokens", 0)),
            completion_tokens=int(usage.get("completion_tokens", 0)),
            raw=data,
        )
        write_trace(
            TraceEvent(
                run_id=_hash(body["messages"]),
                stage="provider.chat",
                provider_label=self.label,
                model=out.model,
                prompt_tokens=out.prompt_tokens,
                completion_tokens=out.completion_tokens,
                latency_ms=latency_ms,
                request_hash=_hash(body),
                response_hash=_hash(content),
            )
        )
        return out

    async def stream(self, request: ChatRequest) -> AsyncIterator[str]:
        body = self._payload(request, stream=True)
        async with self._http().stream("POST", "/chat/completions", json=body) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    return
                try:
                    chunk = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                delta = choices[0].get("delta") or {}
                piece = delta.get("content")
                if piece:
                    yield piece

    async def probe(self) -> Capability:
        from datetime import datetime

        flags: set[CapFlag] = set()
        models: tuple[str, ...] = ()
        last_error: str | None = None

        try:
            resp = await self._http().get("/models")
            if resp.status_code == 200:
                data = resp.json()
                items = data.get("data") or data.get("models") or []
                models = tuple(
                    str(item.get("id") if isinstance(item, dict) else item)
                    for item in items
                )
        except httpx.HTTPError as exc:
            last_error = f"models: {exc!r}"

        try:
            ping = ChatRequest(
                messages=(ChatMessage(role="user", content="ping"),),
                model=self._default_model,
                max_tokens=1,
            )
            await self.chat(ping)
            flags.add(CapFlag.CHAT)
        except httpx.HTTPError as exc:
            last_error = (last_error or "") + f" chat: {exc!r}"

        try:
            stream_req = ChatRequest(
                messages=(ChatMessage(role="user", content="ping"),),
                model=self._default_model,
                max_tokens=1,
                stream=True,
            )
            async for _piece in self.stream(stream_req):
                flags.add(CapFlag.STREAM)
                break
        except httpx.HTTPError:
            pass

        self.capability = Capability(
            label=self.label,
            base_url=self._base_url,
            default_model=self._default_model,
            available_models=models or self.capability.available_models,
            flags=frozenset(flags),
            probed_at=datetime.now(UTC),
            last_error=last_error or None,
        )
        return self.capability
