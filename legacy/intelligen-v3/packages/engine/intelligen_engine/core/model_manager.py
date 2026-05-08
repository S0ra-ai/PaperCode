"""Manage downloadable models (embedding, etc.)."""

from __future__ import annotations

import json
import logging
import os
from typing import Optional

from intelligen_engine.core.redis import get_redis

logger = logging.getLogger(__name__)

AVAILABLE_MODELS = {
    "bge-m3": {
        "name": "BAAI/bge-m3",
        "type": "embedding",
        "size_gb": 2.2,
        "url": "https://huggingface.co/BAAI/bge-m3",
        "description": "Multilingual embedding model for dense, sparse and multi-vector retrieval",
    },
    "bge-large-zh": {
        "name": "BAAI/bge-large-zh-v1.5",
        "type": "embedding",
        "size_gb": 1.3,
        "url": "https://huggingface.co/BAAI/bge-large-zh-v1.5",
        "description": "Chinese embedding model (large)",
    },
    "all-MiniLM-L6-v2": {
        "name": "sentence-transformers/all-MiniLM-L6-v2",
        "type": "embedding",
        "size_gb": 0.09,
        "url": "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2",
        "description": "Lightweight English embedding model",
    },
}

_REDIS_DOWNLOAD_STATUS = "model:download:{model_id}"
_REDIS_ACTIVE_MODEL = "model:active:{model_type}"
_MODEL_CACHE_DIR = os.environ.get("MODEL_CACHE_DIR", "./cache/models")


class ModelManager:
    """Manages downloadable models and active model switching."""

    def __init__(self, cache_dir: str | None = None):
        self.cache_dir = cache_dir or _MODEL_CACHE_DIR

    async def list_available(self) -> list[dict]:
        """List models available for download with their current status."""
        results = []
        for model_id, info in AVAILABLE_MODELS.items():
            status = await self.get_download_status(model_id)
            results.append({
                "id": model_id,
                **info,
                "status": status.get("status", "not_downloaded"),
                "progress": status.get("progress", 0),
            })
        return results

    async def get_download_status(self, model_id: str) -> dict:
        """Check download progress of a model."""
        # Check if model files exist on disk
        model_path = os.path.join(self.cache_dir, model_id)
        if os.path.isdir(model_path) and any(
            f.endswith((".bin", ".safetensors", ".onnx"))
            for f in os.listdir(model_path)
        ):
            return {"status": "downloaded", "progress": 100, "path": model_path}

        # Check Redis for in-progress download
        try:
            r = get_redis()
            raw = await r.get(_REDIS_DOWNLOAD_STATUS.format(model_id=model_id))
            if raw:
                return json.loads(raw)
        except Exception:
            pass

        return {"status": "not_downloaded", "progress": 0}

    async def start_download(self, model_id: str) -> dict:
        """Start downloading a model in background.

        Returns initial status. Actual download is async via huggingface_hub.
        """
        if model_id not in AVAILABLE_MODELS:
            return {"error": f"Unknown model: {model_id}"}

        status = await self.get_download_status(model_id)
        if status.get("status") == "downloaded":
            return {"status": "already_downloaded", "path": status.get("path")}
        if status.get("status") == "downloading":
            return {"status": "already_downloading", "progress": status.get("progress", 0)}

        # Mark as downloading in Redis
        try:
            r = get_redis()
            await r.set(
                _REDIS_DOWNLOAD_STATUS.format(model_id=model_id),
                json.dumps({"status": "downloading", "progress": 0}),
                ex=86400,
            )
        except Exception as exc:
            logger.warning("Redis update failed: %s", exc)

        # Trigger background download
        import asyncio
        asyncio.create_task(self._download_model(model_id))

        return {"status": "downloading", "progress": 0}

    async def _download_model(self, model_id: str):
        """Background task: download model from HuggingFace."""
        info = AVAILABLE_MODELS.get(model_id)
        if not info:
            return

        model_name = info["name"]
        target_dir = os.path.join(self.cache_dir, model_id)
        os.makedirs(target_dir, exist_ok=True)

        try:
            r = get_redis()
            await r.set(
                _REDIS_DOWNLOAD_STATUS.format(model_id=model_id),
                json.dumps({"status": "downloading", "progress": 10}),
                ex=86400,
            )

            # Use huggingface_hub if available, otherwise just mark as needing manual download
            try:
                from huggingface_hub import snapshot_download
                import asyncio
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    lambda: snapshot_download(
                        repo_id=model_name,
                        local_dir=target_dir,
                        local_dir_use_symlinks=False,
                    ),
                )
                await r.set(
                    _REDIS_DOWNLOAD_STATUS.format(model_id=model_id),
                    json.dumps({"status": "downloaded", "progress": 100, "path": target_dir}),
                    ex=86400 * 30,
                )
                logger.info("Model %s downloaded to %s", model_id, target_dir)
            except ImportError:
                await r.set(
                    _REDIS_DOWNLOAD_STATUS.format(model_id=model_id),
                    json.dumps({
                        "status": "error",
                        "progress": 0,
                        "error": "huggingface_hub not installed. Run: pip install huggingface_hub",
                    }),
                    ex=86400,
                )
                logger.error("huggingface_hub not installed, cannot download %s", model_id)
        except Exception as exc:
            logger.error("Model download failed for %s: %s", model_id, exc)
            try:
                r = get_redis()
                await r.set(
                    _REDIS_DOWNLOAD_STATUS.format(model_id=model_id),
                    json.dumps({"status": "error", "progress": 0, "error": str(exc)}),
                    ex=86400,
                )
            except Exception:
                pass

    async def get_active_model(self, model_type: str) -> Optional[str]:
        """Get currently active model for a type (embedding, etc.)."""
        try:
            r = get_redis()
            return await r.get(_REDIS_ACTIVE_MODEL.format(model_type=model_type))
        except Exception:
            return None

    async def switch_model(self, model_type: str, model_id: str) -> dict:
        """Switch active model (requires admin)."""
        if model_id not in AVAILABLE_MODELS:
            return {"error": f"Unknown model: {model_id}"}

        info = AVAILABLE_MODELS[model_id]
        if info["type"] != model_type:
            return {"error": f"Model {model_id} is type '{info['type']}', not '{model_type}'"}

        status = await self.get_download_status(model_id)
        if status.get("status") != "downloaded":
            return {"error": f"Model {model_id} is not downloaded yet"}

        try:
            r = get_redis()
            await r.set(_REDIS_ACTIVE_MODEL.format(model_type=model_type), model_id)
        except Exception as exc:
            return {"error": str(exc)}

        logger.info("Switched active %s model to %s", model_type, model_id)
        return {"status": "ok", "model_type": model_type, "model_id": model_id}


# Global singleton
_model_manager: ModelManager | None = None


def get_model_manager() -> ModelManager:
    global _model_manager
    if _model_manager is None:
        _model_manager = ModelManager()
    return _model_manager


def init_model_manager() -> ModelManager:
    global _model_manager
    _model_manager = ModelManager()
    return _model_manager
