"""模板模型 — 论文生成的格式定义"""

from __future__ import annotations

import enum

from sqlalchemy import Column, String, Text, Integer, DateTime, JSON, Enum as SAEnum
from sqlalchemy.sql import func

from app.platform.database import Base


class TemplateType(str, enum.Enum):
    BUILTIN = "builtin"
    JOURNAL = "journal"
    SCHOOL = "school"
    CUSTOM = "custom"


class TemplateStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class Template(Base):
    __tablename__ = "templates"

    id = Column(String(64), primary_key=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    type = Column(SAEnum(TemplateType), default=TemplateType.CUSTOM)
    status = Column(SAEnum(TemplateStatus), default=TemplateStatus.DRAFT)

    # 学校相关
    school = Column(String(200), nullable=True)
    department = Column(String(200), nullable=True)

    # 期刊相关
    journal_name = Column(String(200), nullable=True)

    # 格式定义 (提取的结构)
    format_json = Column(JSON, nullable=True)

    # 原始源文件
    source_file_url = Column(String(500), nullable=True)

    # 归属
    created_by = Column(String(64), nullable=True)
    is_public = Column(Integer, default=0)

    # 审核
    reviewed_by = Column(String(64), nullable=True)
    review_note = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
