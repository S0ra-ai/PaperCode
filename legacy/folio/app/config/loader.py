# SPDX-License-Identifier: MPL-2.0
"""Config loader.

Resolution order (lowest → highest priority):
  1. Built-in defaults
  2. `~/.folio/config.yml`
  3. Process environment (`FOLIO_*`)

`.env` files are loaded by the dev shell, not by us, so they show up
as plain environment variables here.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field


def folio_home() -> Path:
    root = Path(os.environ.get("FOLIO_HOME", str(Path.home() / ".folio")))
    root.mkdir(parents=True, exist_ok=True)
    return root


class EndpointConfig(BaseModel):
    label: str
    base_url: str
    api_key: str
    default_model: str
    models: tuple[str, ...] = ()
    headers: dict[str, str] = Field(default_factory=dict)
    source: str = "config"  # "config" | "env" | "tui"


class LLMDefaults(BaseModel):
    temperature: float = 0.0
    max_tokens: int = 32768
    timeout: int = 300


class ExperimentDefaults(BaseModel):
    enabled: bool = False
    mode: str = "autopilot"  # "autopilot" | "interactive"
    max_attempts: int = 2
    timeout_s: int = 120
    mem_mb: int = 1024
    image: str = "folio-sandbox:0.1"


class FolioConfig(BaseModel):
    debug: bool = False
    log_level: str = "INFO"
    endpoints: list[EndpointConfig] = Field(default_factory=list)
    llm: LLMDefaults = Field(default_factory=LLMDefaults)
    experiments: ExperimentDefaults = Field(default_factory=ExperimentDefaults)
    telemetry_opt_in: bool = False


def _load_yaml() -> dict[str, Any]:
    path = folio_home() / "config.yml"
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    if not isinstance(data, dict):
        raise ValueError(f"config.yml must be a mapping, got {type(data).__name__}")
    return data


def _endpoints_from_env() -> list[EndpointConfig]:
    labels_raw = os.environ.get("FOLIO_LLM_ENDPOINTS", "").strip()
    if not labels_raw:
        return []
    out: list[EndpointConfig] = []
    for raw in labels_raw.split(","):
        label = raw.strip()
        if not label:
            continue
        prefix = f"FOLIO_LLM_{label.upper()}_"
        base_url = os.environ.get(prefix + "BASE_URL")
        api_key = os.environ.get(prefix + "API_KEY")
        default_model = os.environ.get(prefix + "DEFAULT_MODEL")
        if not (base_url and api_key and default_model):
            continue
        models_raw = os.environ.get(prefix + "MODELS", "")
        models = tuple(m.strip() for m in models_raw.split(",") if m.strip())
        out.append(
            EndpointConfig(
                label=label,
                base_url=base_url,
                api_key=api_key,
                default_model=default_model,
                models=models,
                source="env",
            )
        )
    return out


def _llm_from_env() -> dict[str, Any]:
    out: dict[str, Any] = {}
    if (v := os.environ.get("FOLIO_LLM_TEMPERATURE")) is not None:
        out["temperature"] = float(v)
    if (v := os.environ.get("FOLIO_LLM_MAX_TOKENS")) is not None:
        out["max_tokens"] = int(v)
    if (v := os.environ.get("FOLIO_LLM_TIMEOUT")) is not None:
        out["timeout"] = int(v)
    return out


def load() -> FolioConfig:
    data = _load_yaml()

    if "endpoints" not in data:
        data["endpoints"] = []
    env_endpoints = _endpoints_from_env()
    have = {e["label"] for e in data["endpoints"] if isinstance(e, dict)}
    for ep in env_endpoints:
        if ep.label not in have:
            data["endpoints"].append(ep.model_dump())

    if (v := os.environ.get("FOLIO_DEBUG")) is not None:
        data["debug"] = v.lower() in ("1", "true", "yes", "on")
    if (v := os.environ.get("FOLIO_LOG_LEVEL")) is not None:
        data["log_level"] = v

    llm_env = _llm_from_env()
    if llm_env:
        data["llm"] = {**data.get("llm", {}), **llm_env}

    exp_env = _experiments_from_env()
    if exp_env:
        data["experiments"] = {**data.get("experiments", {}), **exp_env}

    return FolioConfig.model_validate(data)


def _experiments_from_env() -> dict[str, Any]:
    out: dict[str, Any] = {}
    if (v := os.environ.get("FOLIO_EXPERIMENTS_ENABLED")) is not None:
        out["enabled"] = v.lower() in ("1", "true", "yes", "on")
    if (v := os.environ.get("FOLIO_EXPERIMENTS_MODE")) is not None:
        out["mode"] = v
    if (v := os.environ.get("FOLIO_EXPERIMENTS_MAX_ATTEMPTS")) is not None:
        out["max_attempts"] = int(v)
    if (v := os.environ.get("FOLIO_EXPERIMENTS_TIMEOUT_S")) is not None:
        out["timeout_s"] = int(v)
    if (v := os.environ.get("FOLIO_EXPERIMENTS_MEM_MB")) is not None:
        out["mem_mb"] = int(v)
    return out
