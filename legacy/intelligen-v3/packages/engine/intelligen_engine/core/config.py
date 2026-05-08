"""IntelliGen引擎 — 生成服务配置"""

from pydantic_settings import BaseSettings
from pydantic import Field


class EngineSettings(BaseSettings):
    ENGINE_HOST: str = "127.0.0.1"
    ENGINE_PORT: int = 9993

    DATABASE_URL: str = "postgresql+asyncpg://intelligen:intelligen123@localhost:5432/intelligen"

    REDIS_URL: str = "redis://localhost:6379/0"

    # LLM（OpenRouter）
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    LLM_MODEL_NAME: str = ""  # 旧字段兼容，优先用 LLM_CHAT_MODEL / LLM_FAST_MODEL
    LLM_CHAT_MODEL: str = "qwen/qwen3-235b-a22b"
    LLM_FAST_MODEL: str = "qwen/qwen3-30b-a3b"
    LLM_CODE_MODEL: str = "qwen/qwen-coder-plus"
    LLM_TEMPERATURE: float = 0.0
    LLM_MAX_TOKENS: int = 32768
    LLM_TIMEOUT: int = 300

    # DeepSeek (OpenAI 兼容格式)
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com/v1"

    # 多密钥连接池（逗号分隔）
    LLM_API_KEYS: str = ""
    LLM_RPM_LIMIT: int = 60        # 每个密钥每分钟最大请求数
    LLM_TPM_LIMIT: int = 100000    # 每个密钥每分钟最大Token数

    # 搜索
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

    # RAG / 向量嵌入
    EMBEDDING_MODEL_NAME: str = "BAAI/bge-m3"
    EMBEDDING_MODEL_PATH: str = ""  # 预下载模型的本地路径
    RAG_CHUNK_SIZE: int = 2000
    RAG_CHUNK_OVERLAP: int = 300
    RAG_INDEX_DIR: str = "./data/indexes"
    RAG_INDEX_TTL_DAYS: int = 90

    # 本地文档/模板
    KNOWLEDGE_DIR: str = "./database"
    TEMPLATES_DIR: str = "./templates"

    # 上下文管理（AI生成用）
    CONTEXT_CHARS_PER_TOKEN: float = 2.0
    CONTEXT_WINDOW_SIZE: int = 3
    CONTEXT_COMPRESS_THRESHOLD: float = 0.85

    # 安全
    SSL_VERIFY: bool = False

    # 文件存储
    COS_SECRET_ID: str = ""
    COS_SECRET_KEY: str = ""
    COS_BUCKET: str = ""
    COS_REGION: str = "ap-shanghai"
    COS_ENDPOINT: str = ""
    FILE_STORAGE_PATH: str = "./uploads"
    FILE_STORAGE_MODE: str = "local"  # "local" 或 "cos"

    # 字数默认值（中文字符）
    DEFAULT_MIN_WORD_COUNT: int = 20000
    DEFAULT_MAX_WORD_COUNT: int = 30000

    # 日志
    LOG_LEVEL: str = "info"

    @property
    def api_keys(self) -> list[str]:
        """返回LLM连接池的API密钥列表"""
        keys = []
        if self.LLM_API_KEYS:
            keys = [k.strip() for k in self.LLM_API_KEYS.split(",") if k.strip()]
        if not keys and self.OPENROUTER_API_KEY:
            keys = [self.OPENROUTER_API_KEY]
        return keys

    @property
    def resolved_chat_model(self) -> str:
        """主力模型，用于重型任务；向后兼容回退到LLM_MODEL_NAME"""
        return self.LLM_CHAT_MODEL or self.LLM_MODEL_NAME or "qwen/qwen3-235b-a22b"

    @property
    def resolved_fast_model(self) -> str:
        """轻量模型，用于快速任务（关键词、摘要、澄清）"""
        return self.LLM_FAST_MODEL or self.LLM_MODEL_NAME or "qwen/qwen3-30b-a3b"

    @property
    def database_url(self) -> str:
        return self.DATABASE_URL

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


settings = EngineSettings()
