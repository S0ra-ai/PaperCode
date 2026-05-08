# SPDX-License-Identifier: MPL-2.0
"""Tests for unified config schema and resolver."""

import pytest

from app.config.loader import (
    EndpointConfig,
    ExperimentDefaults,
    FolioConfig,
    LLMDefaults,
)
from app.config.schema import ConfigResolver, ConfigSource


class TestConfigResolver:
    """Test config resolution with explicit priority."""

    def test_resolve_picks_highest_priority(self) -> None:
        """Resolver picks highest priority non-None value."""
        sources = {
            "default": ConfigSource("default", 0, 100),
            "config": ConfigSource("config.yml", 1, 200),
            "env": ConfigSource("env", 2, 300),
        }
        result = ConfigResolver.resolve(sources)
        assert result == 300

    def test_resolve_skips_none_values(self) -> None:
        """Resolver skips None values."""
        sources = {
            "default": ConfigSource("default", 0, 100),
            "config": ConfigSource("config.yml", 1, None),
            "env": ConfigSource("env", 2, None),
        }
        result = ConfigResolver.resolve(sources)
        assert result == 100

    def test_resolve_all_none_returns_none(self) -> None:
        """Resolver returns None if all sources are None."""
        sources = {
            "default": ConfigSource("default", 0, None),
            "config": ConfigSource("config.yml", 1, None),
        }
        result = ConfigResolver.resolve(sources)
        assert result is None

    def test_dump_config(self) -> None:
        """Dump config includes all fields."""
        config = FolioConfig(
            debug=True,
            log_level="DEBUG",
            endpoints=[
                EndpointConfig(
                    label="openai",
                    base_url="https://api.openai.com/v1",
                    api_key="sk-1234567890abcdef",
                    default_model="gpt-4",
                    models=("gpt-4", "gpt-3.5-turbo"),
                    source="config",
                )
            ],
            llm=LLMDefaults(temperature=0.5, max_tokens=2048, timeout=60),
        )
        dumped = ConfigResolver.dump(config)

        assert dumped["debug"] is True
        assert dumped["log_level"] == "DEBUG"
        assert len(dumped["endpoints"]) == 1
        assert dumped["endpoints"][0]["label"] == "openai"
        assert dumped["endpoints"][0]["api_key"] == "sk-12345***"
        assert dumped["llm"]["temperature"] == 0.5
        assert "folio_home" in dumped

    def test_validate_config_success(self) -> None:
        """Validate accepts valid config."""
        config = FolioConfig(
            endpoints=[
                EndpointConfig(
                    label="openai",
                    base_url="https://api.openai.com/v1",
                    api_key="sk-test",
                    default_model="gpt-4",
                )
            ],
            llm=LLMDefaults(temperature=0.0, max_tokens=4096, timeout=300),
        )
        errors = ConfigResolver.validate(config)
        assert errors == []

    def test_validate_config_no_endpoints(self) -> None:
        """Validate fails if no endpoints."""
        config = FolioConfig(endpoints=[])
        errors = ConfigResolver.validate(config)
        assert "No LLM endpoints configured" in errors

    def test_validate_config_invalid_timeout(self) -> None:
        """Validate fails if timeout <= 0."""
        config = FolioConfig(
            endpoints=[
                EndpointConfig(
                    label="test",
                    base_url="http://localhost",
                    api_key="test",
                    default_model="test-model",
                )
            ],
            llm=LLMDefaults(temperature=0.0, max_tokens=4096, timeout=-1),
        )
        errors = ConfigResolver.validate(config)
        assert any("timeout" in e.lower() for e in errors)

    def test_validate_config_max_tokens_too_low(self) -> None:
        """Validate fails if max_tokens < 1024."""
        config = FolioConfig(
            endpoints=[
                EndpointConfig(
                    label="test",
                    base_url="http://localhost",
                    api_key="test",
                    default_model="test-model",
                )
            ],
            llm=LLMDefaults(temperature=0.0, max_tokens=512, timeout=300),
        )
        errors = ConfigResolver.validate(config)
        assert any("max tokens" in e.lower() for e in errors)
