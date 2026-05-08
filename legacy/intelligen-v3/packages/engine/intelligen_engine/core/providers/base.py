"""LLM 提供商基类 — 统一调用接口"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Dict, Optional, AsyncIterator


@dataclass
class LLMMessage:
    role: str  # "system", "user", "assistant"
    content: str


@dataclass
class LLMResponse:
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    finish_reason: str = "stop"


class BaseLLMProvider(ABC):
    """LLM 提供商基类 — 所有格式适配器的公共接口"""

    def __init__(
        self,
        name: str,
        base_url: str,
        api_key: str = "",
        timeout: int = 300,
        deployment_type: str = "cloud",
        auth_required: bool = True,
    ):
        self.name = name
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.deployment_type = deployment_type
        self.auth_required = auth_required

    @abstractmethod
    async def chat(
        self,
        messages: List[LLMMessage],
        model: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        **kwargs,
    ) -> LLMResponse:
        """同步聊天请求"""
        ...

    @abstractmethod
    async def chat_stream(
        self,
        messages: List[LLMMessage],
        model: str,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        **kwargs,
    ) -> AsyncIterator[str]:
        """流式聊天请求"""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """连通性检测"""
        ...

    def validate_config(self):
        """验证配置是否完整"""
        if self.auth_required and not self.api_key:
            from intelligen_engine.core.exceptions import LLMConfigError
            raise LLMConfigError(
                detail=f"Provider '{self.name}' 需要 API Key",
                provider=self.name,
            )

    def __repr__(self) -> str:
        return (
            f"<{self.__class__.__name__} name={self.name!r} "
            f"base_url={self.base_url!r} deployment={self.deployment_type}>"
        )
