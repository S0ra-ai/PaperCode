"""Custom exceptions and global exception handlers."""

from __future__ import annotations

import asyncio
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.platform.response import ApiResponse

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


class BusinessException(Exception):
    """Application-level business error."""

    def __init__(self, code: int = 400, message: str = "Business error") -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class UnauthorizedException(BusinessException):
    def __init__(self, message: str = "未授权") -> None:
        super().__init__(code=401, message=message)


class ForbiddenException(BusinessException):
    def __init__(self, message: str = "权限不足") -> None:
        super().__init__(code=403, message=message)


class NotFoundException(BusinessException):
    def __init__(self, message: str = "资源不找到") -> None:
        super().__init__(code=404, message=message)


class ConflictException(BusinessException):
    def __init__(self, message: str = "资源冲突") -> None:
        super().__init__(code=409, message=message)


class ValidationException(BusinessException):
    def __init__(self, message: str = "参数校验失败") -> None:
        super().__init__(code=422, message=message)


class ServiceUnavailableException(BusinessException):
    def __init__(self, message: str = "服务暂时不可用") -> None:
        super().__init__(code=503, message=message)


# ─── LLM 相关异常 ─────────────────────────────────────────

class LLMError(Exception):
    """LLM 调用基类异常"""
    def __init__(self, message: str, code: str = "LLM_ERROR", detail: str = ""):
        self.message = message
        self.code = code
        self.detail = detail
        super().__init__(message)


class LLMConfigError(LLMError):
    """LLM 配置缺失或无效"""
    def __init__(self, message: str = "模型服务未配置，请联系管理员", detail: str = ""):
        super().__init__(message, code="LLM_CONFIG_ERROR", detail=detail)


class LLMGenerationError(LLMError):
    """LLM 调用失败"""
    def __init__(self, message: str = "模型服务暂时不可用，请稍后重试", detail: str = ""):
        super().__init__(message, code="LLM_GENERATION_ERROR", detail=detail)


class LLMRateLimitError(LLMError):
    """LLM 频率限制"""
    def __init__(self, message: str = "请求过于频繁，请稍后重试", detail: str = "", retry_after: int = 60):
        self.retry_after = retry_after
        super().__init__(message, code="LLM_RATE_LIMIT", detail=detail)


def register_exception_handlers(app: FastAPI) -> None:
    """Register all global exception handlers on the FastAPI application."""

    @app.exception_handler(LLMError)
    async def llm_error_handler(
        request: Request, exc: LLMError
    ) -> JSONResponse:
        """将 LLM 异常转换为前端可识别的结构化响应"""
        status_code = 503
        if isinstance(exc, LLMConfigError):
            status_code = 502
        elif isinstance(exc, LLMRateLimitError):
            status_code = 429
        return JSONResponse(
            status_code=200,
            content=ApiResponse.failure(status_code, exc.message),
        )

    @app.exception_handler(BusinessException)
    async def business_exception_handler(
        request: Request, exc: BusinessException
    ) -> JSONResponse:
        return JSONResponse(
            status_code=200,
            content=ApiResponse.failure(exc.code, exc.message),
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(
        request: Request, exc: ValueError
    ) -> JSONResponse:
        logger.error("ValueError: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=200,
            content=ApiResponse.failure(422, "参数格式错误"),
        )

    @app.exception_handler(OSError)
    async def os_error_handler(
        request: Request, exc: OSError
    ) -> JSONResponse:
        logger.error("OSError: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=200,
            content=ApiResponse.failure(500, "文件系统操作失败"),
        )

    @app.exception_handler(TimeoutError)
    async def timeout_error_handler(
        request: Request, exc: TimeoutError
    ) -> JSONResponse:
        logger.error("TimeoutError: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=200,
            content=ApiResponse.failure(504, "请求超时，请稍后重试"),
        )

    @app.exception_handler(asyncio.TimeoutError)
    async def async_timeout_error_handler(
        request: Request, exc: asyncio.TimeoutError
    ) -> JSONResponse:
        logger.error("asyncio.TimeoutError: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=200,
            content=ApiResponse.failure(504, "请求超时，请稍后重试"),
        )

    if httpx is not None:

        @app.exception_handler(httpx.HTTPError)
        async def httpx_error_handler(
            request: Request, exc: httpx.HTTPError  # type: ignore[name-defined]
        ) -> JSONResponse:
            logger.error("httpx.HTTPError: %s", exc, exc_info=True)
            return JSONResponse(
                status_code=200,
                content=ApiResponse.failure(502, "外部服务请求失败"),
            )

    @app.exception_handler(ConnectionError)
    async def connection_error_handler(
        request: Request, exc: ConnectionError
    ) -> JSONResponse:
        logger.error("ConnectionError: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=200,
            content=ApiResponse.failure(503, "网络连接失败"),
        )

    @app.exception_handler(SQLAlchemyError)
    async def db_exception_handler(
        request: Request, exc: SQLAlchemyError
    ) -> JSONResponse:
        logger.error("Database error: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=200,
            content=ApiResponse.failure(500, "数据库操作失败，请稍后重试"),
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.error("Unhandled exception: %s", exc, exc_info=True)
        return JSONResponse(
            status_code=200,
            content=ApiResponse.failure(500, "服务器内部错误，请稍后重试"),
        )
