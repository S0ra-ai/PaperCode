"""Anthropic 格式提供商 — /v1/messages

适用于: Anthropic Claude 系列
"""

import json
import logging
from typing import List, AsyncIterator

import httpx

from intelligen_engine.core.exceptions import (
    LLMGenerationError,
    LLMRateLimitError,
)
from intelligen_engine.core.providers.base import (
    BaseLLMProvider,
    LLMMessage,
    LLMResponse,
)

logger = logging.getLogger(__name__)

_ANTHROPIC_VERSION = "2023-06-01"


class AnthropicProvider(BaseLLMProvider):
    """处理 Anthropic /v1/messages API 格式"""

    async def chat(
        self,
        messages: List[LLMMessage],
        model: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        **kwargs,
    ) -> LLMResponse:
        self.validate_config()
        headers = self._build_headers()
        system_text, api_messages = self._split_system(messages)
        payload = self._build_payload(
            system_text, api_messages, model, temperature, max_tokens, stream=False, **kwargs
        )

        async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/messages",
                    headers=headers,
                    json=payload,
                )
            except httpx.TimeoutException as exc:
                raise LLMGenerationError(
                    detail=f"请求超时 ({self.timeout}s)",
                    provider=self.name,
                ) from exc

            if resp.status_code == 429:
                retry_after = float(resp.headers.get("retry-after", 0))
                raise LLMRateLimitError(
                    detail=f"触发速率限制: {resp.text[:200]}",
                    provider=self.name,
                    retry_after=retry_after,
                )
            if resp.status_code != 200:
                raise LLMGenerationError(
                    detail=f"HTTP {resp.status_code}: {resp.text[:500]}",
                    provider=self.name,
                    status_code=resp.status_code,
                )

            data = resp.json()
            return self._parse_response(data, model)

    async def chat_stream(
        self,
        messages: List[LLMMessage],
        model: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        **kwargs,
    ) -> AsyncIterator[str]:
        self.validate_config()
        headers = self._build_headers()
        system_text, api_messages = self._split_system(messages)
        payload = self._build_payload(
            system_text, api_messages, model, temperature, max_tokens, stream=True, **kwargs
        )

        async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/messages",
                headers=headers,
                json=payload,
            ) as resp:
                if resp.status_code == 429:
                    retry_after = float(resp.headers.get("retry-after", 0))
                    raise LLMRateLimitError(
                        detail="触发速率限制",
                        provider=self.name,
                        retry_after=retry_after,
                    )
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise LLMGenerationError(
                        detail=f"HTTP {resp.status_code}: {body.decode()[:500]}",
                        provider=self.name,
                        status_code=resp.status_code,
                    )

                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    chunk = line[6:]
                    if chunk.strip() == "[DONE]":
                        break
                    try:
                        obj = json.loads(chunk)
                        # Anthropic SSE: content_block_delta 事件
                        if obj.get("type") == "content_block_delta":
                            text = obj.get("delta", {}).get("text", "")
                            if text:
                                yield text
                    except (json.JSONDecodeError, KeyError):
                        continue

    async def health_check(self) -> bool:
        """发送极小请求检测连通性"""
        try:
            headers = self._build_headers()
            payload = {
                "model": "claude-3-haiku-20240307",
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "hi"}],
            }
            async with httpx.AsyncClient(timeout=10, verify=False) as client:
                resp = await client.post(
                    f"{self.base_url}/messages",
                    headers=headers,
                    json=payload,
                )
                return resp.status_code == 200
        except Exception:
            return False

    # ── 内部方法 ──────────────────────────────────────────────

    def _build_headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "anthropic-version": _ANTHROPIC_VERSION,
        }

    @staticmethod
    def _split_system(messages: List[LLMMessage]):
        """Anthropic 要求 system 为顶层参数，非 messages 数组成员"""
        system_parts: list[str] = []
        api_msgs: list[dict] = []
        for m in messages:
            if m.role == "system":
                system_parts.append(m.content)
            else:
                api_msgs.append({"role": m.role, "content": m.content})
        return "\n".join(system_parts) if system_parts else None, api_msgs

    @staticmethod
    def _build_payload(
        system_text,
        api_messages: list,
        model: str,
        temperature: float,
        max_tokens: int,
        stream: bool = False,
        **kwargs,
    ) -> dict:
        payload: dict = {
            "model": model,
            "messages": api_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }
        if system_text:
            payload["system"] = system_text
        for k, v in kwargs.items():
            if v is not None:
                payload[k] = v
        return payload

    @staticmethod
    def _parse_response(data: dict, model: str) -> LLMResponse:
        # Anthropic 响应: content[0].text
        content_blocks = data.get("content", [])
        text = ""
        for block in content_blocks:
            if block.get("type") == "text":
                text += block.get("text", "")
        usage = data.get("usage", {})
        return LLMResponse(
            content=text.strip(),
            model=data.get("model", model),
            prompt_tokens=usage.get("input_tokens", 0),
            completion_tokens=usage.get("output_tokens", 0),
            total_tokens=usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
            finish_reason=data.get("stop_reason", "end_turn"),
        )
