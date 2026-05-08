# SPDX-License-Identifier: MPL-2.0
"""Configuration schema with explicit priority levels.

Provides:
- Unified FolioConfig schema (centralized)
- Priority order documentation (env > cli > config.yml > defaults)
- Config dump for diagnostics
- Type validation via Pydantic
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, ClassVar

from app.config.loader import FolioConfig, folio_home


@dataclass
class ConfigSource:
    """Metadata about a config value's origin."""

    name: str  # "default" | "config.yml" | "env" | "cli"
    priority: int  # 0=lowest, 3=highest
    value: Any


class ConfigResolver:
    """Resolves config values across multiple sources with explicit priority."""

    PRIORITY_ORDER: ClassVar[list[str]] = ["default", "config.yml", "env", "cli"]

    @staticmethod
    def resolve(sources: dict[str, ConfigSource]) -> Any:
        """Pick the highest-priority non-None value."""
        valid = [s for s in sources.values() if s.value is not None]
        if not valid:
            return None
        return max(valid, key=lambda s: s.priority).value

    @staticmethod
    def dump(config: FolioConfig) -> dict[str, Any]:
        """Dump config as YAML-serializable dict for debugging.

        Includes all fields + source annotations.
        """
        return {
            "debug": config.debug,
            "log_level": config.log_level,
            "telemetry_opt_in": config.telemetry_opt_in,
            "endpoints": [
                {
                    "label": ep.label,
                    "base_url": ep.base_url,
                    "api_key": f"{ep.api_key[:8]}***" if len(ep.api_key) > 8 else "***",
                    "default_model": ep.default_model,
                    "models": ep.models,
                    "source": ep.source,
                }
                for ep in config.endpoints
            ],
            "llm": {
                "temperature": config.llm.temperature,
                "max_tokens": config.llm.max_tokens,
                "timeout": config.llm.timeout,
            },
            "experiments": {
                "enabled": config.experiments.enabled,
                "mode": config.experiments.mode,
                "max_attempts": config.experiments.max_attempts,
                "timeout_s": config.experiments.timeout_s,
                "mem_mb": config.experiments.mem_mb,
                "image": config.experiments.image,
            },
            "folio_home": str(folio_home()),
        }

    @staticmethod
    def validate(config: FolioConfig) -> list[str]:
        """Validate config; return list of errors.

        Checks:
        - At least one endpoint configured
        - Timeout > 0
        - Max tokens reasonable (> 1024)
        """
        errors = []

        if not config.endpoints:
            errors.append("No LLM endpoints configured")

        if config.llm.timeout <= 0:
            errors.append(f"Invalid timeout: {config.llm.timeout}")

        if config.llm.max_tokens < 1024:
            errors.append(f"Max tokens too low: {config.llm.max_tokens}")

        for ep in config.endpoints:
            if not ep.default_model and not ep.models:
                errors.append(
                    f"Endpoint '{ep.label}' has no default or available models"
                )

        return errors
