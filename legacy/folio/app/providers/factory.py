# SPDX-License-Identifier: MPL-2.0
"""Wire ProviderRegistry from FolioConfig."""

from __future__ import annotations

from app.config.loader import FolioConfig
from app.providers.openai_compat import OpenAICompatibleProvider
from app.providers.registry import ProviderRegistry


class NoProviderConfiguredError(RuntimeError):
    """Raised when an LLM stage runs but no provider is configured."""


def build_registry(config: FolioConfig) -> ProviderRegistry:
    """Build a `ProviderRegistry` from `config.endpoints`.

    All endpoints share the same `OpenAICompatibleProvider` class —
    no vendor branching. Endpoints that fail validation (e.g. missing
    api_key) are skipped with a warning so the TUI's onboarding path
    can guide the user instead of crashing mid-pipeline.

    Secrets stored via the TUI keyring backend are merged in here via
    ``providers_store.resolve_api_key`` — the YAML file persists only
    a placeholder for TUI-managed endpoints.
    """
    import warnings

    from app.config.providers_store import resolve_api_key

    reg = ProviderRegistry()
    for ep in config.endpoints:
        api_key = resolve_api_key(ep)
        try:
            provider = OpenAICompatibleProvider(
                label=ep.label,
                base_url=ep.base_url,
                api_key=api_key,
                default_model=ep.default_model,
                models=ep.models,
                headers=ep.headers,
                timeout=float(config.llm.timeout),
            )
        except ValueError as exc:
            warnings.warn(
                f"skipping endpoint '{ep.label}': {exc}",
                stacklevel=2,
            )
            continue
        reg.register(provider)
    return reg


def first_provider(reg: ProviderRegistry) -> OpenAICompatibleProvider:
    """Return the first registered provider; raise if none configured.

    M1 has no SAMA routing yet (M2 `m2-sama`); stages call this to
    pick whichever endpoint the user wired in. Cast is safe because
    `build_registry` only registers `OpenAICompatibleProvider`.
    """
    if len(reg) == 0:
        raise NoProviderConfiguredError(
            "No LLM endpoint configured. Set FOLIO_LLM_ENDPOINTS=... + per-label "
            "BASE_URL/API_KEY/DEFAULT_MODEL in .env, or use the TUI Settings → "
            "Endpoints panel."
        )
    return next(iter(reg))  # type: ignore[return-value]
