"""Unified API response format matching Java backend's ApiResponse."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class ApiResponse(BaseModel):
    code: int = 200
    message: str = ""
    data: Any = None

    @staticmethod
    def success(message: str = "success", data: Any = None) -> dict:
        return {"code": 200, "message": message, "data": data}

    @staticmethod
    def failure(code: int = 400, message: str = "error") -> dict:
        return {"code": code, "message": message, "data": None}


class PageResponse:
    @staticmethod
    def of(items: list, page: int, page_size: int, total: int) -> dict:
        return {
            "list": items,
            "page": page,
            "pageSize": page_size,
            "total": total,
        }
