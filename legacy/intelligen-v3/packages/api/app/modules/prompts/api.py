"""提示词管理 API — 代理转发到 Engine 服务"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.platform.response import ApiResponse
from app.modules.auth.deps import CurrentUser, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/prompts", tags=["prompts"])

try:
    from app.platform.config import settings as _settings
    ENGINE_BASE = _settings.ENGINE_BASE_URL
except Exception:
    ENGINE_BASE = "http://127.0.0.1:9993"


class PromptUpdateRequest(BaseModel):
    content: str


class PromptPreviewRequest(BaseModel):
    variables: dict = {}


async def _engine_request(method: str, path: str, json_body: dict | None = None) -> dict:
    """转发请求到 Engine 服务。"""
    try:
        async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
            if method == "GET":
                resp = await client.get(f"{ENGINE_BASE}{path}")
            elif method == "PUT":
                resp = await client.put(f"{ENGINE_BASE}{path}", json=json_body)
            elif method == "POST":
                resp = await client.post(f"{ENGINE_BASE}{path}", json=json_body)
            else:
                return {}
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        try:
            detail = exc.response.json().get("detail", str(exc)) if exc.response else str(exc)
        except Exception:
            detail = exc.response.text[:200] if exc.response else str(exc)
        return {"_error": True, "code": exc.response.status_code, "detail": detail}
    except Exception as exc:
        logger.warning("Engine 请求失败 (%s): %s", path, exc)
        return {"_error": True, "code": 502, "detail": f"Engine 不可达: {exc}"}


def _handle_result(data: dict, success_msg: str):
    if data.get("_error"):
        return ApiResponse.failure(data.get("code", 500), data.get("detail", "未知错误"))
    return ApiResponse.success(success_msg, data)


@router.get("")
async def list_prompts(current_user: CurrentUser = Depends(require_admin)):
    """列出所有提示词阶段"""
    data = await _engine_request("GET", "/engine/prompts")
    return _handle_result(data, "获取提示词列表成功")


@router.get("/{stage}")
async def get_prompt(stage: str, current_user: CurrentUser = Depends(require_admin)):
    """获取单个阶段的提示词"""
    data = await _engine_request("GET", f"/engine/prompts/{stage}")
    return _handle_result(data, "获取提示词成功")


@router.put("/{stage}")
async def update_prompt(
    stage: str,
    req: PromptUpdateRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    """更新提示词内容"""
    data = await _engine_request("PUT", f"/engine/prompts/{stage}", {"content": req.content})
    return _handle_result(data, "提示词已更新")


@router.post("/{stage}/preview")
async def preview_prompt(
    stage: str,
    req: PromptPreviewRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    """预览渲染后的提示词"""
    data = await _engine_request("POST", f"/engine/prompts/{stage}/preview", {"variables": req.variables})
    return _handle_result(data, "预览成功")
