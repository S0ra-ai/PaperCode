"""模板服务 — CRUD + 审核工作流业务逻辑"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session as DBSession

from app.platform.exceptions import (
    BusinessException,
    NotFoundException,
    ForbiddenException,
)
from app.modules.templates.models import Template, TemplateType, TemplateStatus


class TemplateService:
    """无状态服务；所有方法显式接收db会话"""

    # ── 创建 ──────────────────────────────────────────────
    @staticmethod
    def create_template(
        *,
        name: str,
        user_id: str,
        description: str = "",
        template_type: TemplateType = TemplateType.CUSTOM,
        school: Optional[str] = None,
        department: Optional[str] = None,
        journal_name: Optional[str] = None,
        format_json: Optional[dict] = None,
        source_file_url: Optional[str] = None,
        is_public: int = 0,
        db: DBSession,
    ) -> Template:
        tpl = Template(
            id=str(uuid.uuid4()),
            name=name,
            description=description,
            type=template_type,
            status=TemplateStatus.DRAFT,
            school=school,
            department=department,
            journal_name=journal_name,
            format_json=format_json,
            source_file_url=source_file_url,
            created_by=user_id,
            is_public=is_public,
        )
        db.add(tpl)
        db.commit()
        db.refresh(tpl)
        return tpl

    # ── 查询 ────────────────────────────────────────────────
    @staticmethod
    def get_template(template_id: str, db: DBSession) -> Template:
        tpl = db.query(Template).filter(Template.id == template_id).first()
        if not tpl:
            raise NotFoundException("模板不存在")
        return tpl

    @staticmethod
    def list_templates(
        *,
        user_id: Optional[str] = None,
        template_type: Optional[TemplateType] = None,
        status: Optional[TemplateStatus] = None,
        school: Optional[str] = None,
        keyword: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
        db: DBSession,
    ) -> tuple[list[Template], int]:
        q = db.query(Template)

        if template_type:
            q = q.filter(Template.type == template_type)
        if status:
            q = q.filter(Template.status == status)
        if school:
            q = q.filter(Template.school.ilike(f"%{school}%"))
        if keyword:
            q = q.filter(
                Template.name.ilike(f"%{keyword}%")
                | Template.description.ilike(f"%{keyword}%")
            )

        # 可见性: 用户能看到自己的模板 + 已审核的公开模板
        if user_id:
            q = q.filter(
                (Template.created_by == user_id)
                | (
                    (Template.is_public == 1)
                    & (Template.status == TemplateStatus.APPROVED)
                )
                | (Template.type == TemplateType.BUILTIN)
            )

        total = q.count()
        items = (
            q.order_by(Template.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return items, total

    # ── 更新 ──────────────────────────────────────────────
    @staticmethod
    def update_template(
        template_id: str,
        user_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        school: Optional[str] = None,
        department: Optional[str] = None,
        journal_name: Optional[str] = None,
        format_json: Optional[dict] = None,
        source_file_url: Optional[str] = None,
        is_public: Optional[int] = None,
        db: DBSession,
    ) -> Template:
        tpl = TemplateService.get_template(template_id, db)
        if tpl.created_by != user_id:
            raise ForbiddenException("无权修改此模板")

        if name is not None:
            tpl.name = name
        if description is not None:
            tpl.description = description
        if school is not None:
            tpl.school = school
        if department is not None:
            tpl.department = department
        if journal_name is not None:
            tpl.journal_name = journal_name
        if format_json is not None:
            tpl.format_json = format_json
        if source_file_url is not None:
            tpl.source_file_url = source_file_url
        if is_public is not None:
            tpl.is_public = is_public

        db.commit()
        db.refresh(tpl)
        return tpl

    # ── 删除 ──────────────────────────────────────────────
    @staticmethod
    def delete_template(template_id: str, user_id: str, db: DBSession) -> None:
        tpl = TemplateService.get_template(template_id, db)
        if tpl.created_by != user_id:
            raise ForbiddenException("无权删除此模板")
        db.delete(tpl)
        db.commit()

    # ── 审核工作流 ──────────────────────────────────────────
    @staticmethod
    def submit_for_review(template_id: str, user_id: str, db: DBSession) -> Template:
        tpl = TemplateService.get_template(template_id, db)
        if tpl.created_by != user_id:
            raise ForbiddenException("无权提交此模板")
        if tpl.status not in (TemplateStatus.DRAFT, TemplateStatus.REJECTED):
            raise BusinessException(400, "当前状态不允许提交审核")
        tpl.status = TemplateStatus.PENDING
        db.commit()
        db.refresh(tpl)
        return tpl

    @staticmethod
    def approve_template(
        template_id: str, admin_id: str, note: str = "", db: DBSession = None
    ) -> Template:
        tpl = TemplateService.get_template(template_id, db)
        if tpl.status != TemplateStatus.PENDING:
            raise BusinessException(400, "只能审核待审核的模板")
        tpl.status = TemplateStatus.APPROVED
        tpl.reviewed_by = admin_id
        tpl.review_note = note
        tpl.is_public = 1
        db.commit()
        db.refresh(tpl)
        return tpl

    @staticmethod
    def reject_template(
        template_id: str, admin_id: str, note: str = "", db: DBSession = None
    ) -> Template:
        tpl = TemplateService.get_template(template_id, db)
        if tpl.status != TemplateStatus.PENDING:
            raise BusinessException(400, "只能审核待审核的模板")
        tpl.status = TemplateStatus.REJECTED
        tpl.reviewed_by = admin_id
        tpl.review_note = note
        db.commit()
        db.refresh(tpl)
        return tpl
