"""OpenAI 兼容格式提供商 — /v1/chat/completions

适用于: OpenAI, OpenRouter, DeepSeek, Moonshot, 智谱GLM,
        Qwen, Groq, Together, vLLM, Ollama
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


class OpenAICompatibleProvider(BaseLLMProvider):
    """处理所有 OpenAI /v1/chat/completions 兼容 API"""

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
        payload = self._build_payload(messages, model, temperature, max_tokens, stream=False, **kwargs)

        async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
            try:
                resp = await client.post(
                    f"{self.base_url}/chat/completions",
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
        payload = self._build_payload(messages, model, temperature, max_tokens, stream=True, **kwargs)

        async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
            async with client.stream(
                "POST",
                f"{self.base_url}/chat/completions",
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
                        delta = obj["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

    async def health_check(self) -> bool:
        """尝试调用 /models 端点检测连通性"""
        try:
            headers = self._build_headers()
            async with httpx.AsyncClient(timeout=10, verify=False) as client:
                resp = await client.get(f"{self.base_url}/models", headers=headers)
                return resp.status_code == 200
        except Exception:
            return False

    # ── 内部方法 ──────────────────────────────────────────────

    def _build_headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    @staticmethod
    def _build_payload(
        messages: List[LLMMessage],
        model: str,
        temperature: float,
        max_tokens: int,
        stream: bool = False,
        **kwargs,
    ) -> dict:
        payload = {
            "model": model,
            "messages": [{"role": m.role, "content": m.content} for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }
        # 允许透传额外参数 (top_p, frequency_penalty 等)
        for k, v in kwargs.items():
            if v is not None:
                payload[k] = v
        return payload

    @staticmethod
    def _parse_response(data: dict, model: str) -> LLMResponse:
        choice = data["choices"][0]
        usage = data.get("usage", {})
        return LLMResponse(
            content=choice["message"]["content"].strip(),
            model=data.get("model", model),
            prompt_tokens=usage.get("prompt_tokens", 0),
            completion_tokens=usage.get("completion_tokens", 0),
            total_tokens=usage.get("total_tokens", 0),
            finish_reason=choice.get("finish_reason", "stop"),
        )
