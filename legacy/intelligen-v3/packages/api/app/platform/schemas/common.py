"""Common response schemas."""

from __future__ import annotations
from typing import Any
from pydantic import BaseModel


class ApiResponseSchema(BaseModel):
    code: int = 200
    message: str = ""
    data: Any = None


class PageResponseSchema(BaseModel):
    list: list[Any] = []
    page: int = 1
    pageSize: int = 10
    total: int = 0
