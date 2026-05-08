"""Automatically route tasks to appropriate models.

Extends the pipeline ModelRouter with DB-backed admin overrides and a
broader task-type mapping that includes search and embedding.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from intelligen_engine.core.config import settings

logger = logging.getLogger(__name__)

# Default task→model mapping (admin can override via DB)
MODEL_ROUTING: dict[str, str] = {
    "writing": "qwen/qwen3-235b-a22b",
    "planning": "qwen/qwen3-235b-a22b",
    "review": "qwen/qwen3-235b-a22b",
    "clarification": "qwen/qwen3-30b-a3b",
    "summary": "qwen/qwen3-30b-a3b",
    "extraction": "qwen/qwen3-30b-a3b",
    "keyword": "qwen/qwen3-30b-a3b",
    "code_analysis": "qwen/qwen-coder-plus",
    "search": "perplexity/sonar-pro",
}

# Default parameters per task type
DEFAULT_PARAMS: dict[str, dict] = {
    "writing": {"temperature": 0.3, "max_tokens": 32768, "timeout": 300},
    "planning": {"temperature": 0.1, "max_tokens": 4096, "timeout": 120},
    "review": {"temperature": 0.0, "max_tokens": 8192, "timeout": 180},
    "clarification": {"temperature": 0.2, "max_tokens": 2048, "timeout": 60},
    "summary": {"temperature": 0.0, "max_tokens": 2048, "timeout": 60},
    "extraction": {"temperature": 0.0, "max_tokens": 2048, "timeout": 60},
    "keyword": {"temperature": 0.0, "max_tokens": 1024, "timeout": 60},
    "code_analysis": {"temperature": 0.0, "max_tokens": 8192, "timeout": 180},
    "search": {"temperature": 0.0, "max_tokens": 4096, "timeout": 120},
}


class ModelRouter:
    """Select the right model based on task type and context.

    Priority: DB config (admin overrides) → Redis cache → in-memory defaults.
    """

    def __init__(self):
        self._routing = dict(MODEL_ROUTING)
        self._params = {k: dict(v) for k, v in DEFAULT_PARAMS.items()}

    async def get_model(self, task_type: str) -> str:
        """Get the appropriate model for a task type."""
        # 1. Check Redis for admin override
        try:
            from intelligen_engine.core.redis import get_redis
            r = get_redis()
            override = await r.get(f"config:model_route:{task_type}")
            if override:
                return override
        except Exception:
            pass

        # 2. Fall back to in-memory routing
        model = self._routing.get(task_type)
        if model:
            return model

        # 3. Default to chat model
        logger.warning("Unknown task type '%s', falling back to chat model", task_type)
        return settings.resolved_chat_model

    async def get_model_params(self, task_type: str) -> dict:
        """Get model parameters (temperature, max_tokens, etc.)."""
        # Check Redis for admin override
        try:
            from intelligen_engine.core.redis import get_redis
            r = get_redis()
            raw = await r.get(f"config:model_params:{task_type}")
            if raw:
                return json.loads(raw)
        except Exception:
            pass

        return dict(self._params.get(task_type, DEFAULT_PARAMS.get("writing", {})))

    async def update_route(self, task_type: str, model: str):
        """Admin: override model for a task type (persisted in Redis)."""
        self._routing[task_type] = model
        try:
            from intelligen_engine.core.redis import get_redis
            r = get_redis()
            await r.set(f"config:model_route:{task_type}", model)
        except Exception as exc:
            logger.warning("Failed to persist route override: %s", exc)

    async def update_params(self, task_type: str, params: dict):
        """Admin: override parameters for a task type."""
        self._params[task_type] = params
        try:
            from intelligen_engine.core.redis import get_redis
            r = get_redis()
            await r.set(
                f"config:model_params:{task_type}",
                json.dumps(params, ensure_ascii=False),
            )
        except Exception as exc:
            logger.warning("Failed to persist params override: %s", exc)

    def list_routes(self) -> dict[str, str]:
        """List all task-type → model mappings."""
        return dict(self._routing)

    def list_params(self) -> dict[str, dict]:
        """List all task-type → params mappings."""
        return {k: dict(v) for k, v in self._params.items()}


# Global singleton
_router: Optional[ModelRouter] = None


def get_model_router() -> ModelRouter:
    global _router
    if _router is None:
        _router = ModelRouter()
    return _router


def init_model_router() -> ModelRouter:
    global _router
    _router = ModelRouter()
    return _router
