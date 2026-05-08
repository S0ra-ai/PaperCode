"""初始化向导业务逻辑 — 原子化首次初始化"""

from __future__ import annotations

import logging
import os
import pathlib
import re
import shutil
import uuid
from typing import Optional

from sqlalchemy import text, func
from sqlalchemy.orm import Session

from app.modules.auth.models import User
from app.modules.auth.enums import UserRole
from app.platform.config import settings
from app.platform.security import hash_password
from .schemas import (
    DataAction, DataStats, SetupStatusResponse,
    LLMSetup, StorageSetup,
)

logger = logging.getLogger(__name__)

# 后端使用的 .env 文件路径
_ENV_FILE = pathlib.Path(__file__).resolve().parents[3] / ".env"


# ---------------------------------------------------------------------------
# 公开辅助函数
# ---------------------------------------------------------------------------

def get_setup_status(db: Session) -> SetupStatusResponse:
    """检查是否需要初始化 (无管理员即需要)"""
    admin_count = db.query(func.count(User.userId)).filter(User.role == UserRole.ADMIN).scalar() or 0
    needs_setup = admin_count == 0

    has_data = False
    stats = DataStats()
    if needs_setup:
        stats.users = _safe_count(db, "users")
        stats.sessions = _safe_count(db, "sessions")
        stats.tasks = _safe_count(db, "generate_tasks")
        stats.files = _safe_count(db, "files")
        has_data = (stats.users + stats.sessions + stats.tasks + stats.files) > 0

    return SetupStatusResponse(
        needsSetup=needs_setup,
        hasExistingData=has_data,
        hasLlmConfig=bool(settings.OPENROUTER_API_KEY),
        hasStorageConfig=_has_storage_config(),
        dataStats=stats if has_data else None,
    )


def run_setup(
    db: Session,
    username: str,
    password: str,
    nickname: str,
    email: str,
    data_action: DataAction,
    llm: Optional[LLMSetup] = None,
    storage: Optional[StorageSetup] = None,
) -> dict:
    """原子化首次初始化 — 数据迁移、配置持久化、管理员创建

    如果管理员已存在则抛出 ValueError (防止竞态)。
    """
    # ── 原子保护: 事务内再次检查管理员数量 ──
    admin_count = db.query(func.count(User.userId)).filter(User.role == UserRole.ADMIN).scalar() or 0
    if admin_count > 0:
        raise ValueError("管理员账号已存在，无法重复初始化。")

    username_taken = db.query(User).filter(User.username == username).first()
    if username_taken:
        raise ValueError(f"用户名 '{username}' 已被占用。")

    migrated = _apply_data_action(db, data_action)

    # ── 将 LLM / 存储配置持久化到 .env ──
    env_updates: dict[str, str] = {}
    if llm:
        env_updates.update(_llm_to_env(llm))
    if storage:
        env_updates.update(_storage_to_env(storage))
    if env_updates:
        _update_env_file(env_updates)

    # ── 创建超级管理员 ──
    admin = User(
        userId=str(uuid.uuid4()),
        username=username,
        password=hash_password(password),
        nickname=nickname,
        email=email,
        role=UserRole.ADMIN,
        authStatus=1,  # auto-approved
    )
    db.add(admin)
    db.flush()  # ensure insert before commit

    return {
        "userId": admin.userId,
        "username": admin.username,
        "dataAction": data_action.value,
        "migrated": migrated,
    }


def save_llm_config(llm: LLMSetup) -> dict:
    """保存LLM配置到 .env 并热更新进程内设置"""
    env_updates = _llm_to_env(llm)
    _update_env_file(env_updates)
    _reload_settings(env_updates)
    return {"saved": True, "keys": list(env_updates.keys())}


def save_storage_config(storage: StorageSetup) -> dict:
    """保存存储配置到 .env 并热更新进程内设置"""
    env_updates = _storage_to_env(storage)
    _update_env_file(env_updates)
    _reload_settings(env_updates)
    return {"saved": True, "mode": storage.mode}


def test_llm_connection(api_key: str, base_url: str, model: str) -> dict:
    """LLM提供商快速连通性测试"""
    try:
        import httpx
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": "Hi"}],
            "max_tokens": 8,
        }
        with httpx.Client(timeout=30, verify=False) as client:
            resp = client.post(f"{base_url}/chat/completions", json=payload, headers=headers)
        if resp.status_code == 200:
            return {"ok": True, "message": "连接成功"}
        body = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        err_msg = body.get("error", {}).get("message", resp.text[:200])
        return {"ok": False, "message": f"API 返回 {resp.status_code}: {err_msg}"}
    except Exception as exc:
        return {"ok": False, "message": f"连接失败: {exc}"}


def test_cos_connection(secret_id: str, secret_key: str, bucket: str, region: str) -> dict:
    """腾讯云COS快速连通性测试"""
    try:
        import httpx
        endpoint = f"https://{bucket}.cos.{region}.myqcloud.com"
        # 简单匿名 HEAD 请求检查存储桶是否可达 (凭证错误也会返回403，但端点可达)
        with httpx.Client(timeout=15, verify=False) as client:
            resp = client.head(endpoint)
        if resp.status_code in (200, 403):
            return {"ok": True, "message": "COS 端点可达"}
        return {"ok": False, "message": f"COS 返回 {resp.status_code}"}
    except Exception as exc:
        return {"ok": False, "message": f"COS 连接失败: {exc}"}


# ---------------------------------------------------------------------------
# 内部辅助函数
# ---------------------------------------------------------------------------

def _safe_count(db: Session, table: str) -> int:
    try:
        return db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0
    except Exception:
        return 0


def _has_storage_config() -> bool:
    """判断是否已配置COS或本地存储路径非默认值"""
    if settings.COS_SECRET_ID and settings.COS_SECRET_KEY and settings.COS_BUCKET:
        return True
    return bool(settings.FILE_STORAGE_PATH and settings.FILE_STORAGE_PATH != "uploads")


def _llm_to_env(llm: LLMSetup) -> dict[str, str]:
    return {
        "OPENROUTER_API_KEY": llm.api_key,
        "OPENROUTER_BASE_URL": llm.base_url,
        "LLM_CHAT_MODEL": llm.writing_model,
        "LLM_FAST_MODEL": llm.fast_model,
    }


def _storage_to_env(storage: StorageSetup) -> dict[str, str]:
    env: dict[str, str] = {}
    if storage.mode == "local":
        env["FILE_STORAGE_PATH"] = storage.local_path or "./uploads"
    elif storage.mode == "cos":
        env["COS_SECRET_ID"] = storage.cos_secret_id
        env["COS_SECRET_KEY"] = storage.cos_secret_key
        env["COS_BUCKET"] = storage.cos_bucket
        env["COS_REGION"] = storage.cos_region
    return env


def _update_env_file(updates: dict[str, str]) -> None:
    """将更新合并到 .env 文件，保留注释和原始顺序"""
    lines: list[str] = []
    if _ENV_FILE.exists():
        lines = _ENV_FILE.read_text(encoding="utf-8").splitlines()

    written_keys: set[str] = set()
    new_lines: list[str] = []
    for line in lines:
        stripped = line.strip()
        # Match KEY=VALUE (possibly quoted)
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=", stripped)
        if match:
            key = match.group(1)
            if key in updates:
                new_lines.append(f"{key}={updates[key]}")
                written_keys.add(key)
                continue
        new_lines.append(line)

    # 追加文件中不存在的 key
    for key, value in updates.items():
        if key not in written_keys:
            new_lines.append(f"{key}={value}")

    _ENV_FILE.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def _reload_settings(env_updates: dict[str, str]) -> None:
    """更新 .env 后热修补进程内 settings 对象"""
    for key, value in env_updates.items():
        if hasattr(settings, key):
            try:
                # pydantic-settings fields are usually frozen; use object.__setattr__
                object.__setattr__(settings, key, value)
            except Exception:
                pass


def _apply_data_action(db: Session, action: DataAction) -> dict:
    """在当前事务内执行数据迁移/重置"""
    if action == DataAction.KEEP_ALL:
        return {"action": "keep_all", "deleted": {}}

    # 按外键约束顺序清除 (子表优先)
    tables_to_clear = [
        "section_checkpoints",
        "task_executions",
        "generate_task_files",
        "generate_tasks",
        "files",
        "sessions",
        "admin_access_logs",
        "operation_logs",
    ]

    if action == DataAction.FULL_RESET:
        tables_to_clear.append("users")

    deleted = {}
    for table in tables_to_clear:
        try:
            count = db.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar() or 0
            if count > 0:
                db.execute(text(f"DELETE FROM {table}"))
                deleted[table] = count
        except Exception as e:
            logger.warning("Failed to clear table %s: %s", table, e)
            deleted[table] = f"error: {e}"

    # 清理物理文件
    _cleanup_upload_dir()

    return {"action": action.value, "deleted": deleted}


def _cleanup_upload_dir():
    """删除磁盘上的上传文件"""
    upload_dir = settings.FILE_STORAGE_PATH
    if os.path.isdir(upload_dir):
        for entry in os.listdir(upload_dir):
            path = os.path.join(upload_dir, entry)
            try:
                if os.path.isfile(path):
                    os.remove(path)
                elif os.path.isdir(path):
                    shutil.rmtree(path)
            except OSError as e:
                logger.warning("Failed to remove %s: %s", path, e)
