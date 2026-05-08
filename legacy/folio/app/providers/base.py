# SPDX-License-Identifier: MPL-2.0
"""Provider abstract base class.

Per AGENTS.md § 1.2, every LLM call goes through a `Provider`. Per
§ 1.6, only one concrete adapter exists project-wide:
`OpenAICompatibleProvider` (added in M2). Per § 1.5 there is **no**
`MockProvider` — tests use recorded cassettes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from app.core.contract import Capability


@dataclass(frozen=True)
class ChatMessage:
    role: str  # "system" | "user" | "assistant" | "tool"
    content: str


@dataclass(frozen=True)
class ChatRequest:
    messages: tuple[ChatMessage, ...]
    model: str
    temperature: float = 0.0
    max_tokens: int | None = None
    tools: tuple[dict[str, Any], ...] | None = None
    response_format: dict[str, Any] | None = None
    stream: bool = False


@dataclass(frozen=True)
class ChatResponse:
    content: str
    model: str
    prompt_tokens: int
    completion_tokens: int
    raw: dict[str, Any]


class Provider(ABC):
    """Abstract LLM endpoint adapter."""

    label: str
    capability: Capability

    @abstractmethod
    async def chat(self, request: ChatRequest) -> ChatResponse: ...

    @abstractmethod
    async def stream(self, request: ChatRequest) -> AsyncIterator[str]: ...

    @abstractmethod
    async def probe(self) -> Capability:
        """Refresh `self.capability` by hitting the live endpoint."""
