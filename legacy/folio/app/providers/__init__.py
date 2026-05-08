# SPDX-License-Identifier: MPL-2.0
"""Provider layer: vendor-agnostic LLM adapters."""

from app.providers.base import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    Provider,
)
from app.providers.cost import (
    BudgetExceededError,
    CostMeter,
    EndpointUsage,
    assert_within_budget,
    budget_ceiling_usd,
    get_meter,
    load_prices,
    reset_meter,
)
from app.providers.factory import (
    NoProviderConfiguredError,
    build_registry,
    first_provider,
)
from app.providers.failover import (
    AllProvidersFailedError,
    FailoverResult,
)
from app.providers.failover import (
    chat as failover_chat,
)
from app.providers.openai_compat import OpenAICompatibleProvider
from app.providers.registry import ProviderNotFoundError, ProviderRegistry
from app.providers.sama import (
    AXES,
    DEFAULT_LAMBDA,
    DEFAULT_WEIGHTS,
    NoCandidatesError,
    ProviderQuote,
    RouteDecision,
    Router,
    StageNotConfiguredError,
)

__all__ = [
    "AXES",
    "DEFAULT_LAMBDA",
    "DEFAULT_WEIGHTS",
    "AllProvidersFailedError",
    "BudgetExceededError",
    "ChatMessage",
    "ChatRequest",
    "ChatResponse",
    "CostMeter",
    "EndpointUsage",
    "FailoverResult",
    "NoCandidatesError",
    "NoProviderConfiguredError",
    "OpenAICompatibleProvider",
    "Provider",
    "ProviderNotFoundError",
    "ProviderQuote",
    "ProviderRegistry",
    "RouteDecision",
    "Router",
    "StageNotConfiguredError",
    "assert_within_budget",
    "budget_ceiling_usd",
    "build_registry",
    "failover_chat",
    "first_provider",
    "get_meter",
    "load_prices",
    "reset_meter",
]
