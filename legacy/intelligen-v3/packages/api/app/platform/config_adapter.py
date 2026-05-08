"""
Config adapter — provides a Config class matching the model_strategy interface.
Services migrated from model_strategy use `from config.config import Config`.
This module provides the same interface backed by FastAPI settings.
"""
from app.platform.config import settings


class Config:
    """Adapter that exposes settings in the same interface as model_strategy's Config."""

    # API keys
    OPENROUTER_API_KEY = property(lambda self: settings.OPENROUTER_API_KEY)
    SERPAPI_KEY = property(lambda self: settings.SERPAPI_KEY)
    ACADEMIC_EMAIL = property(lambda self: settings.ACADEMIC_EMAIL)

    # LLM
    LLM_MODEL_NAME = property(lambda self: settings.LLM_MODEL_NAME)
    LLM_TEMPERATURE = property(lambda self: settings.LLM_TEMPERATURE)
    LLM_MAX_TOKENS = property(lambda self: settings.LLM_MAX_TOKENS)
    LLM_TIMEOUT = property(lambda self: settings.LLM_TIMEOUT)

    # Search
    SEARCH_MODEL_NAME = property(lambda self: settings.SEARCH_MODEL_NAME)
    SEARCH_LIMIT = property(lambda self: settings.SEARCH_LIMIT)

    # Directories
    KNOWLEDGE_DIR = property(lambda self: settings.KNOWLEDGE_DIR)
    TEMPLATES_DIR = property(lambda self: settings.TEMPLATES_DIR)
    EMBEDDING_MODEL_NAME = property(lambda self: settings.EMBEDDING_MODEL_NAME)


# The original Config uses class-level attributes accessed as Config.X (not instance).
# We use a module-level trick: replace this module's Config with a class that
# supports both Config.X and Config().X access patterns.

class _ConfigMeta(type):
    """Metaclass that forwards attribute access to settings."""
    def __getattr__(cls, name):
        # Provide resolved model shortcuts
        if name == "LLM_CHAT_MODEL":
            return settings.resolved_chat_model
        if name == "LLM_FAST_MODEL":
            return settings.resolved_fast_model
        return getattr(settings, name)


class Config(metaclass=_ConfigMeta):
    """Drop-in replacement for model_strategy's Config class.
    
    Supports both Config.OPENROUTER_API_KEY and Config().OPENROUTER_API_KEY.
    """
    def __getattr__(self, name):
        if name == "LLM_CHAT_MODEL":
            return settings.resolved_chat_model
        if name == "LLM_FAST_MODEL":
            return settings.resolved_fast_model
        return getattr(settings, name)
