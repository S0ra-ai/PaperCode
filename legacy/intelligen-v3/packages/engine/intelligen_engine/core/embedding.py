"""Embedding model management — supports local bge-m3.

Provides a unified interface for generating embeddings. The actual model
loading is deferred until first use or explicit initialization from admin UI.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from intelligen_engine.core.config import settings

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Manages embedding model loading and inference."""

    def __init__(self):
        self._model = None
        self._model_name: str = settings.EMBEDDING_MODEL_NAME
        self._dimension: int = 1024  # bge-m3 default

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    @property
    def model_name(self) -> str:
        return self._model_name

    async def initialize(self, model_name: str | None = None):
        """Load embedding model (download if needed).

        Supports HuggingFace sentence-transformers models loaded via
        the ``sentence_transformers`` library.
        """
        if model_name:
            self._model_name = model_name

        try:
            from sentence_transformers import SentenceTransformer
            import asyncio

            loop = asyncio.get_running_loop()
            self._model = await loop.run_in_executor(
                None,
                lambda: SentenceTransformer(
                    self._model_name,
                    trust_remote_code=True,
                ),
            )
            dim = self._model.get_sentence_embedding_dimension()
            if dim:
                self._dimension = dim
            logger.info(
                "Embedding model '%s' loaded (dim=%d)",
                self._model_name,
                self._dimension,
            )
        except ImportError:
            logger.warning(
                "sentence_transformers not installed — embedding unavailable. "
                "Install with: pip install sentence-transformers"
            )
        except Exception as exc:
            logger.error("Failed to load embedding model '%s': %s", self._model_name, exc)

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts."""
        if self._model is None:
            raise RuntimeError(
                "Embedding model not loaded. Call initialize() first or "
                "download the model from the admin panel."
            )
        import asyncio

        loop = asyncio.get_running_loop()
        embeddings = await loop.run_in_executor(
            None,
            lambda: self._model.encode(texts, normalize_embeddings=True).tolist(),
        )
        return embeddings

    async def embed_query(self, query: str) -> list[float]:
        """Generate embedding for a single query string."""
        results = await self.embed([query])
        return results[0]

    def get_info(self) -> dict:
        """Return model status information."""
        return {
            "model_name": self._model_name,
            "is_loaded": self.is_loaded,
            "dimension": self._dimension,
        }


# Global singleton
_embedding_service: Optional[EmbeddingService] = None


def get_embedding_service() -> EmbeddingService:
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


def init_embedding_service() -> EmbeddingService:
    global _embedding_service
    _embedding_service = EmbeddingService()
    return _embedding_service
