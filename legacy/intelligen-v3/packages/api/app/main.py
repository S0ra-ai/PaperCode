"""FastAPI application entry point."""

from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.platform.config import settings
from app.platform.exceptions import register_exception_handlers
from app.platform.logging import setup_logging
from app.platform.middleware import RequestIdMiddleware, AuditLogMiddleware, SetupGuardMiddleware
from app.platform.database import SessionLocal, engine, Base
from app.modules.auth.models import User
from app.platform.security import hash_password
from app.modules.auth.enums import UserRole

# Import all models so Base.metadata.create_all() sees every table
from app.modules.workspace.models.session import Session  # noqa: F401
from app.modules.workspace.models.task import GenerateTask, GenerateTaskFile  # noqa: F401
from app.modules.workspace.models.file import StoredFile  # noqa: F401
from app.platform.models.audit import OperationLog, AdminAccessLog  # noqa: F401
from app.modules.generation.models import TaskExecution, SectionCheckpoint  # noqa: F401
from app.modules.templates.models import Template  # noqa: F401
from app.modules.admin.models_config import LLMModelConfig  # noqa: F401
from app.modules.llm.models import LLMProvider, LLMStageConfig  # noqa: F401

setup_logging(log_level=settings.LOG_LEVEL)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("IntelliGen server starting on port %s", settings.SERVER_PORT)

    # 安全检查: JWT_SECRET 必须非空
    jwt_secret = (settings.JWT_SECRET or "").strip()
    if not jwt_secret:
        logger.error(
            "JWT_SECRET 未设置！服务将以不安全模式启动。"
            "请在 .env 中配置 JWT_SECRET (建议至少 32 字符)"
        )
        # 生产环境应该拒绝启动 — 这里只 error log，避免阻断开发流程
    elif len(jwt_secret) < 16:
        logger.warning(
            "JWT_SECRET 过短 (%d 字符) — 建议至少 32 字符以保证安全",
            len(jwt_secret),
        )

    # Auto-create any missing tables (safe for both SQLite and PostgreSQL)
    Base.metadata.create_all(bind=engine)

    # Skip env-var bootstrap when setup wizard is enabled
    if settings.SETUP_WIZARD:
        logger.info("Setup wizard enabled — skipping env-var admin bootstrap")
    else:
        _bootstrap_admin()

    # Test Redis connection (non-fatal)
    from app.core.redis import redis_available, close_redis
    if redis_available():
        logger.info("Redis connection OK (%s)", settings.REDIS_URL)
    else:
        logger.warning("Redis unavailable at %s — caching disabled", settings.REDIS_URL)

    # 启动后把 DB 中的 Provider 同步到 Engine
    import asyncio
    async def _deferred_sync():
        # 延迟几秒等 engine 就绪
        await asyncio.sleep(3)
        try:
            from app.modules.llm.api import _sync_providers_to_engine
            from app.platform.database import SessionLocal
            db = SessionLocal()
            try:
                await _sync_providers_to_engine(db)
            finally:
                db.close()
        except Exception as exc:
            logger.warning("启动时同步 Provider 到 Engine 失败: %s", exc)
    asyncio.create_task(_deferred_sync())

    yield

    # Shutdown: close Redis
    close_redis()
    logger.info("IntelliGen server shutting down")


def create_app() -> FastAPI:
    app = FastAPI(
        title="IntelliGen API",
        description="AI-powered academic report generation platform",
        version="2.3.0",
        docs_url="/swagger-ui.html",
        openapi_url="/v3/api-docs",
        lifespan=lifespan,
    )

    # Request ID middleware
    app.add_middleware(RequestIdMiddleware)

    # Audit logging middleware (runs after RequestIdMiddleware sets request_id)
    app.add_middleware(AuditLogMiddleware)

    # Setup guard — 503 for non-setup requests when no admin exists
    if settings.SETUP_WIZARD:
        app.add_middleware(SetupGuardMiddleware)

    # Rate limiting middleware
    from app.core.rate_limiter import RateLimiterMiddleware
    app.add_middleware(RateLimiterMiddleware)

    # CORS — added last so it runs FIRST (outermost middleware)
    # This ensures CORS headers are present even on 429/503 error responses
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["Authorization", "X-Request-Id", "X-Trace-Id"],
    )

    # Exception handlers
    register_exception_handlers(app)

    # Static file serving for uploads
    upload_dir = settings.FILE_STORAGE_PATH
    os.makedirs(upload_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    # Register routes
    from app.modules.auth import api as auth
    from app.modules.workspace.api import sessions, files, tasks
    from app.modules.admin import api as admin
    from app.modules.setup import api as setup
    from app.modules.templates import api as templates
    from app.modules.llm import api as llm_providers
    from app.modules.prompts import api as prompts
    from app.platform.api import health
    app.include_router(setup.router)
    app.include_router(auth.router)
    app.include_router(sessions.router)
    app.include_router(files.router)
    app.include_router(tasks.router)
    app.include_router(admin.router)
    app.include_router(llm_providers.router)
    app.include_router(prompts.router)
    app.include_router(templates.router)
    app.include_router(health.router)

    return app


def _bootstrap_admin():
    """Create initial admin user if ADMIN_BOOTSTRAP_USERNAME is set."""
    if not settings.ADMIN_BOOTSTRAP_USERNAME:
        return

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == settings.ADMIN_BOOTSTRAP_USERNAME).first()
        if existing:
            logger.info("Admin user '%s' already exists", settings.ADMIN_BOOTSTRAP_USERNAME)
            return

        admin = User(
            userId=str(uuid.uuid4()),
            username=settings.ADMIN_BOOTSTRAP_USERNAME,
            password=hash_password(settings.ADMIN_BOOTSTRAP_PASSWORD),
            nickname=settings.ADMIN_BOOTSTRAP_NICKNAME,
            email=settings.ADMIN_BOOTSTRAP_EMAIL,
            role=UserRole.ADMIN,
            authStatus=1,  # auto-approved
        )
        db.add(admin)
        db.commit()
        logger.info("Bootstrap admin user '%s' created", settings.ADMIN_BOOTSTRAP_USERNAME)
    except Exception as e:
        logger.error("Failed to bootstrap admin: %s", e)
        db.rollback()
    finally:
        db.close()


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.SERVER_PORT, reload=True)
