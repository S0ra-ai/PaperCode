"""初始化向导API — 首次运行时创建管理员 + LLM/存储配置"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.platform.database import get_db
from .schemas import SetupStatusResponse, SetupInitRequest, LLMSetup, StorageSetup
from .service import (
    get_setup_status,
    run_setup,
    save_llm_config,
    save_storage_config,
    test_llm_connection,
    test_cos_connection,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/setup", tags=["setup"])


def _require_admin_if_setup_done(request: Request, db: Session):
    """若已完成初始化（存在管理员），则要求 admin JWT；否则允许公开访问。"""
    from app.modules.auth.models import User
    from app.modules.auth.enums import UserRole
    admin_count = db.query(func.count(User.userId)).filter(User.role == UserRole.ADMIN).scalar() or 0
    if admin_count == 0:
        return
    # 已初始化 — 检查 token
    from app.platform.security import verify_token
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="初始化已完成，该端点需要管理员登录")
    token = auth.split(None, 1)[1].strip()
    claims = verify_token(token)
    if not claims or claims.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="需要管理员权限")


@router.get("/status", response_model=SetupStatusResponse)
def check_setup_status(db: Session = Depends(get_db)):
    """公开端点 — 返回是否需要初始化"""
    return get_setup_status(db)


@router.post("/init")
def initialize_system(req: SetupInitRequest, db: Session = Depends(get_db)):
    """原子化首次初始化 — 创建管理员 + 可选LLM/存储配置

    仅在数据库无管理员时才能执行。
    """
    try:
        result = run_setup(
            db,
            username=req.admin.username,
            password=req.admin.password,
            nickname=req.admin.nickname,
            email=req.admin.email,
            data_action=req.dataAction,
            llm=req.llm,
            storage=req.storage,
        )
        db.commit()
        logger.info("Setup completed: admin=%s action=%s", result["username"], result["dataAction"])
        return {"success": True, **result}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error("Setup failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"初始化失败: {e}")


@router.post("/llm")
def setup_llm(data: LLMSetup, request: Request, db: Session = Depends(get_db)):
    """保存LLM配置 (初始化期间和之后均可使用)"""
    _require_admin_if_setup_done(request, db)
    try:
        result = save_llm_config(data)
        return {"success": True, **result}
    except Exception as e:
        logger.error("LLM config save failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"保存 LLM 配置失败: {e}")


@router.post("/llm/test")
def test_llm(data: LLMSetup, request: Request, db: Session = Depends(get_db)):
    """测试LLM API连通性，不保存配置"""
    _require_admin_if_setup_done(request, db)
    return test_llm_connection(data.api_key, data.base_url, data.fast_model)


@router.post("/storage")
def setup_storage(data: StorageSetup, request: Request, db: Session = Depends(get_db)):
    """保存文件存储配置"""
    _require_admin_if_setup_done(request, db)
    try:
        result = save_storage_config(data)
        return {"success": True, **result}
    except Exception as e:
        logger.error("Storage config save failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"保存存储配置失败: {e}")


@router.post("/storage/test")
def test_storage(data: StorageSetup, request: Request, db: Session = Depends(get_db)):
    """测试COS连通性，不保存配置"""
    _require_admin_if_setup_done(request, db)
    if data.mode == "local":
        return {"ok": True, "message": "本地存储无需测试"}
    return test_cos_connection(
        data.cos_secret_id, data.cos_secret_key,
        data.cos_bucket, data.cos_region,
    )


@router.post("/complete")
def complete_setup(db: Session = Depends(get_db)):
    """标记初始化完成 (校验管理员已创建)"""
    from sqlalchemy import func
    from app.modules.auth.models import User
    from app.modules.auth.enums import UserRole

    admin_count = db.query(func.count(User.userId)).filter(User.role == UserRole.ADMIN).scalar() or 0
    if admin_count == 0:
        raise HTTPException(status_code=400, detail="请先创建管理员账号")
    return {"success": True, "message": "初始化已完成"}
