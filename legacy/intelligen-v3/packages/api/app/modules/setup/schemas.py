"""初始化向导请求/响应模型"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DataAction(str, Enum):
    """初始化时对已有数据的处理策略"""
    KEEP_ALL = "keep_all"
    KEEP_USERS = "keep_users"
    FULL_RESET = "full_reset"


class DataStats(BaseModel):
    users: int = 0
    sessions: int = 0
    tasks: int = 0
    files: int = 0


class SetupStatusResponse(BaseModel):
    needsSetup: bool
    hasExistingData: bool
    hasLlmConfig: bool
    hasStorageConfig: bool
    dataStats: Optional[DataStats] = None


class AdminAccount(BaseModel):
    username: str = Field(..., min_length=2, max_length=50)
    password: str = Field(..., min_length=6, max_length=128)
    nickname: str = Field(..., min_length=1, max_length=50)
    email: str = Field(..., pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


class LLMSetup(BaseModel):
    provider: str = "openrouter"
    api_key: str = Field(..., min_length=1)
    base_url: str = "https://openrouter.ai/api/v1"
    writing_model: str = "qwen/qwen3-235b-a22b"
    fast_model: str = "qwen/qwen3-30b-a3b"


class StorageSetup(BaseModel):
    mode: str = "local"  # "local" or "cos"
    local_path: str = "./uploads"
    cos_secret_id: str = ""
    cos_secret_key: str = ""
    cos_bucket: str = ""
    cos_region: str = "ap-shanghai"


class SetupInitRequest(BaseModel):
    admin: AdminAccount
    dataAction: DataAction = DataAction.KEEP_ALL
    llm: Optional[LLMSetup] = None
    storage: Optional[StorageSetup] = None
