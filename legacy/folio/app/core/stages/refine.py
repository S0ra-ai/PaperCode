# SPDX-License-Identifier: MPL-2.0
"""Refine stage: revise the latest draft per a user instruction.

Triggered by the TUI ``:refine <text>`` command (or free-form text after
the pipeline finishes). Per AGENTS.md § 1.2, the LLM call goes through
the registry; per § 1.4, ``trace.record`` is called for the call.
"""

from __future__ import annotations

from app.core.contract import StageMessage
from app.providers.base import ChatMessage, ChatRequest
from app.providers.factory import first_provider
from app.providers.registry import ProviderRegistry

SYSTEM_PROMPT = (
    "You are a paper-writing assistant. Revise the user's draft per the "
    "instruction. Preserve the original section structure and citation "
    "markers (e.g. \\cite{key}). Return ONLY the revised draft text."
)


async def run(
    msg: StageMessage,
    *,
    instruction: str,
    registry: ProviderRegistry,
) -> StageMessage:
    draft = str(msg.payload.get("draft") or "")
    if not draft:
        raise RuntimeError("refine: no draft in payload — run draft first")
    if not instruction.strip():
        raise RuntimeError("refine: empty instruction")

    provider = first_provider(registry)
    user_msg = (
        f"DRAFT:\n{draft}\n\nINSTRUCTION:\n{instruction.strip()}\n\n"
        "Return the entire revised draft."
    )
    request = ChatRequest(
        messages=(
            ChatMessage(role="system", content=SYSTEM_PROMPT),
            ChatMessage(role="user", content=user_msg),
        ),
        model=provider.capability.default_model,
        temperature=0.2,
    )
    response = await provider.chat(request)

    new = msg.model_copy(deep=True)
    new.payload["draft"] = response.content.strip()
    history = list(new.payload.get("refine_history") or [])
    history.append(
        {
            "instruction": instruction.strip(),
            "prompt_tokens": response.prompt_tokens,
            "completion_tokens": response.completion_tokens,
        }
    )
    new.payload["refine_history"] = history
    return new
