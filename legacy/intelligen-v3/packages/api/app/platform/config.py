"""Application settings loaded from environment variables."""

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # Database — set DATABASE_URL to override
    # PostgreSQL: postgresql+psycopg2://user:pass@host:5432/db
    # SQLite: sqlite:///./data/intelligen.db
    DATABASE_URL: str = ""
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "intelligen"
    DB_USERNAME: str = "intelligen"
    DB_PASSWORD: str = ""

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = ""
    JWT_EXPIRATION_HOURS: int = 24
    JWT_ALGORITHM: str = "HS256"

    # Server
    SERVER_PORT: int = 9992

    # File storage
    FILE_STORAGE_PATH: str = "uploads"
    FILE_PUBLIC_BASE_URL: str = "http://127.0.0.1:9992"
    FILE_STORAGE_MODE: str = "local"  # "local" or "cos"
    MAX_FILE_SIZE: int = 50 * 1024 * 1024  # 50MB
    ALLOWED_FILE_EXTENSIONS: str = "pdf,docx,doc,xlsx,xls,pptx,ppt,txt,md,csv"

    # CORS
    CORS_ALLOWED_ORIGINS: str = "http://127.0.0.1:9991,http://localhost:9991"

    # Admin bootstrap
    ADMIN_BOOTSTRAP_USERNAME: str = ""
    ADMIN_BOOTSTRAP_PASSWORD: str = ""
    ADMIN_BOOTSTRAP_NICKNAME: str = "System Admin"
    ADMIN_BOOTSTRAP_EMAIL: str = "admin@example.com"
    SETUP_WIZARD: bool = True  # When True, skip env-var bootstrap; use /setup wizard instead

    # Engine service
    ENGINE_BASE_URL: str = "http://127.0.0.1:9993"

    # OpenRouter LLM
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    LLM_MODEL_NAME: str = ""  # legacy fallback; prefer LLM_CHAT_MODEL / LLM_FAST_MODEL
    LLM_CHAT_MODEL: str = "qwen/qwen3-235b-a22b"  # primary: planning, writing, review
    LLM_FAST_MODEL: str = "qwen/qwen3-30b-a3b"    # lightweight: keyword, summary, clarify
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 32768
    LLM_TIMEOUT: int = 300
    GENERATION_TIMEOUT_SECONDS: int = 1800  # 总生成超时 (30 分钟)

    # DeepSeek (OpenAI 兼容格式)
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"

    # Search
    SEARCH_MODEL_NAME: str = "perplexity/sonar-pro"
    SERPAPI_KEY: str = ""
    ACADEMIC_EMAIL: str = ""
    SEARCH_LIMIT: int = 6
    SEARCH_CACHE_BACKEND: str = "disk"
    SEARCH_CACHE_DIR: str = "./cache/search"
    SEARCH_CACHE_TTL_SECONDS: int = 86400
    SEARCH_SOURCE_WEIGHT_CROSSREF: float = 1.0
    SEARCH_SOURCE_WEIGHT_OPENALEX: float = 0.95
    SEARCH_SOURCE_WEIGHT_SEMANTIC_SCHOLAR: float = 0.92
    SEARCH_SOURCE_WEIGHT_ARXIV: float = 0.88
    SEARCH_SOURCE_WEIGHT_PERPLEXITY_SONAR: float = 0.7
    SEARCH_SOURCE_WEIGHT_GOOGLE_SCHOLAR: float = 0.65

    # Local docs / RAG
    KNOWLEDGE_DIR: str = "./database"
    TEMPLATES_DIR: str = "./templates"
    EMBEDDING_MODEL_NAME: str = "./cache/huggingface/models--sentence-transformers--all-MiniLM-L6-v2"

    # Tencent Cloud COS (file storage)
    COS_SECRET_ID: str = ""
    COS_SECRET_KEY: str = ""
    COS_BUCKET: str = ""
    COS_REGION: str = "ap-shanghai"
    COS_ENDPOINT: str = ""

    # Security
    COOKIE_SECURE: bool = False  # Set True in production
    SSL_VERIFY: bool = False     # Set True when SSL certs are properly configured

    # Context Manager (AI generation)
    CONTEXT_CHARS_PER_TOKEN: float = 2.0
    CONTEXT_WINDOW_SIZE: int = 3
    CONTEXT_COMPRESS_THRESHOLD: float = 0.85

    # RAG
    RAG_CHUNK_SIZE: int = 2000
    RAG_CHUNK_OVERLAP: int = 300
    RAG_INDEX_DIR: str = "./data/indexes"
    RAG_INDEX_TTL_DAYS: int = 90

    # Logging
    LOG_LEVEL: str = "info"

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        return (
            f"postgresql+psycopg2://{self.DB_USERNAME}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def resolved_chat_model(self) -> str:
        """Primary model for heavy tasks. Falls back to LLM_MODEL_NAME for backward compat."""
        return self.LLM_CHAT_MODEL or self.LLM_MODEL_NAME or "qwen/qwen3-235b-a22b"

    @property
    def resolved_fast_model(self) -> str:
        """Lightweight model for quick tasks (keywords, summaries, clarification)."""
        return self.LLM_FAST_MODEL or self.LLM_MODEL_NAME or "qwen/qwen3-30b-a3b"

    @property
    def allowed_extensions(self) -> set[str]:
        return {e.strip().lower() for e in self.ALLOWED_FILE_EXTENSIONS.split(",")}

    @property
    def search_source_weights(self) -> dict[str, float]:
        return {
            "Crossref API": float(self.SEARCH_SOURCE_WEIGHT_CROSSREF),
            "OpenAlex": float(self.SEARCH_SOURCE_WEIGHT_OPENALEX),
            "Semantic Scholar": float(self.SEARCH_SOURCE_WEIGHT_SEMANTIC_SCHOLAR),
            "ArXiv": float(self.SEARCH_SOURCE_WEIGHT_ARXIV),
            "Perplexity Sonar": float(self.SEARCH_SOURCE_WEIGHT_PERPLEXITY_SONAR),
            "Google Scholar": float(self.SEARCH_SOURCE_WEIGHT_GOOGLE_SCHOLAR),
        }

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
