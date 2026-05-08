"""Google Gemini 格式提供商 — /v1/models/{model}:generateContent

适用于: Google Gemini 系列
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


class GoogleProvider(BaseLLMProvider):
    """处理 Google Gemini /v1/models/{model}:generateContent API"""

    async def chat(
        self,
        messages: List[LLMMessage],
        model: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        **kwargs,
    ) -> LLMResponse:
        self.validate_config()
        url = self._endpoint(model, stream=False)
        payload = self._build_payload(messages, temperature, max_tokens, **kwargs)

        async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
            try:
                resp = await client.post(url, json=payload)
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
        url = self._endpoint(model, stream=True)
        payload = self._build_payload(messages, temperature, max_tokens, **kwargs)

        async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
            async with client.stream("POST", url, json=payload) as resp:
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

                buffer = ""
                async for chunk_bytes in resp.aiter_bytes():
                    buffer += chunk_bytes.decode()
                    # Gemini streamGenerateContent 返回 JSON 数组片段
                    while True:
                        try:
                            # 尝试解析完整 JSON 对象
                            obj, end_idx = json.JSONDecoder().raw_decode(buffer.lstrip(" ,[\n"))
                            buffer = buffer[buffer.index(buffer.lstrip(" ,[\n")[0]) + end_idx:]
                            text = self._extract_text(obj)
                            if text:
                                yield text
                        except (json.JSONDecodeError, ValueError):
                            break

    async def health_check(self) -> bool:
        """列出可用模型检测连通性"""
        try:
            url = f"{self.base_url}/models?key={self.api_key}"
            async with httpx.AsyncClient(timeout=10, verify=False) as client:
                resp = await client.get(url)
                return resp.status_code == 200
        except Exception:
            return False

    # ── 内部方法 ──────────────────────────────────────────────

    def _endpoint(self, model: str, stream: bool = False) -> str:
        action = "streamGenerateContent" if stream else "generateContent"
        return f"{self.base_url}/models/{model}:{action}?key={self.api_key}"

    @staticmethod
    def _build_payload(
        messages: List[LLMMessage],
        temperature: float,
        max_tokens: int,
        **kwargs,
    ) -> dict:
        """转换为 Gemini contents 格式"""
        contents: list[dict] = []
        system_instruction = None

        for m in messages:
            if m.role == "system":
                system_instruction = {"parts": [{"text": m.content}]}
                continue
            role = "model" if m.role == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": m.content}]})

        payload: dict = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_instruction:
            payload["systemInstruction"] = system_instruction
        return payload

    @staticmethod
    def _extract_text(obj: dict) -> str:
        """从 Gemini 响应中提取文本"""
        try:
            candidates = obj.get("candidates", [])
            if not candidates:
                return ""
            parts = candidates[0].get("content", {}).get("parts", [])
            return "".join(p.get("text", "") for p in parts)
        except (KeyError, IndexError):
            return ""

    @staticmethod
    def _parse_response(data: dict, model: str) -> LLMResponse:
        candidates = data.get("candidates", [])
        text = ""
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts)

        usage = data.get("usageMetadata", {})
        prompt_tokens = usage.get("promptTokenCount", 0)
        completion_tokens = usage.get("candidatesTokenCount", 0)

        finish_reason = "stop"
        if candidates:
            finish_reason = candidates[0].get("finishReason", "STOP").lower()

        return LLMResponse(
            content=text.strip(),
            model=model,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            finish_reason=finish_reason,
        )
