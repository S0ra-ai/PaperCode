"""IntelliGen引擎 — 独立生成服务，供API网关内部调用"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from intelligen_engine.core.config import settings
from intelligen_engine.core.exceptions import LLMError, LLMConfigError, LLMRateLimitError
from intelligen_engine.api.routes import router as engine_router, set_task_manager, set_index_service

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动与关闭生命周期管理"""
    logger.info(f"[Engine] Starting on {settings.ENGINE_HOST}:{settings.ENGINE_PORT}")

    # 1. 初始化Redis
    from intelligen_engine.core.redis import init_redis, close_redis
    await init_redis()
    logger.info("[Engine] Redis connected")

    # 2. 初始化数据库（确保模型先注册再create_all）
    from intelligen_engine.core.database import init_db, close_db
    import intelligen_engine.tasks.models  # noqa: F401  — 注册 EngineTask
    import intelligen_engine.pipeline.models  # noqa: F401  — 注册 TaskExecution, SectionCheckpoint
    await init_db()
    logger.info("[Engine] Database initialized")

    # 2b. 初始化LLM连接池
    from intelligen_engine.core.llm_pool import init_llm_pool
    await init_llm_pool()
    logger.info("[Engine] LLM pool initialized")

    # 2c. 初始化多提供商注册中心
    from intelligen_engine.core.providers.registry import init_provider_registry
    from intelligen_engine.core.providers.openai_compatible import OpenAICompatibleProvider
    registry = init_provider_registry()

    # 默认注册 OpenRouter (主力)
    if settings.OPENROUTER_API_KEY:
        registry.register("openrouter", OpenAICompatibleProvider(
            name="openrouter",
            base_url=settings.OPENROUTER_BASE_URL,
            api_key=settings.OPENROUTER_API_KEY,
            timeout=settings.LLM_TIMEOUT,
        ))
        registry.set_fallback_chain([
            ("openrouter", settings.resolved_chat_model),
        ])

    # 注册 DeepSeek (如有配置)
    if settings.DEEPSEEK_API_KEY:
        registry.register("deepseek", OpenAICompatibleProvider(
            name="deepseek",
            base_url=settings.DEEPSEEK_BASE_URL,
            api_key=settings.DEEPSEEK_API_KEY,
            timeout=settings.LLM_TIMEOUT,
        ))
        # 追加到 fallback 链
        current_chain = registry._fallback_chain[:]
        current_chain.append(("deepseek", "deepseek-chat"))
        registry.set_fallback_chain(current_chain)

    logger.info("[Engine] Provider registry initialized: %s",
                list(registry.list_providers().keys()))

    # 3. 创建TaskManager单例并注入路由
    from intelligen_engine.tasks.task_manager import TaskManager
    task_manager = TaskManager()
    set_task_manager(task_manager)

    # 3b. 创建IndexService单例，预加载索引并注入路由
    from intelligen_engine.pipeline.retrieval.index_service import IndexService
    index_service = IndexService()
    index_service.preload_indexes()
    set_index_service(index_service)
    logger.info("[Engine] IndexService initialized and indexes preloaded")

    # 4. 初始化指标收集器
    from intelligen_engine.core.metrics import init_metrics
    init_metrics()
    logger.info("[Engine] Metrics collector initialized")

    # 5. 初始化模型管理器与路由
    from intelligen_engine.core.model_manager import init_model_manager
    from intelligen_engine.core.model_router import init_model_router
    from intelligen_engine.core.embedding import init_embedding_service
    init_model_manager()
    init_model_router()
    init_embedding_service()
    logger.info("[Engine] Model manager, router & embedding service initialized")

    # 6. 恢复中断的任务
    await task_manager.recover_tasks()

    # 6b. 清理陈旧的 Redis 任务队列残留（历史版本只 lpush 不 rpop 会导致假排队）
    try:
        from intelligen_engine.core.redis import get_redis
        r = get_redis()
        stale = await r.llen("engine:task_queue")
        if stale:
            await r.delete("engine:task_queue")
            logger.info("[Engine] Cleared %d stale entries from engine:task_queue", stale)
    except Exception as _exc:
        logger.warning("[Engine] 清理陈旧队列失败: %s", _exc)

    logger.info("[Engine] Startup complete")

    yield

    # 关闭阶段
    logger.info("[Engine] Shutting down")
    await close_redis()
    await close_db()
    logger.info("[Engine] Shutdown complete")


app = FastAPI(
    title="IntelliGen Engine",
    description="Generation engine for academic report creation",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 内部服务，由API网关管控访问
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(engine_router, prefix="/engine")


@app.exception_handler(LLMError)
async def llm_error_handler(request, exc: LLMError):
    """将 LLM 异常转换为结构化 JSON 响应"""
    status = 503
    if isinstance(exc, LLMConfigError):
        status = 502
    elif isinstance(exc, LLMRateLimitError):
        status = 429
    return JSONResponse(
        status_code=status,
        content={"code": exc.code, "message": exc.message, "detail": exc.detail},
    )


@app.get("/health")
async def health():
    return {"status": "UP", "service": "intelligen-engine"}
