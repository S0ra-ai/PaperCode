"""模板API — CRUD + 审核工作流端点"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DBSession

from app.platform.response import ApiResponse, PageResponse
from app.platform.database import get_db
from app.modules.auth.deps import CurrentUser, require_approved, require_admin
from app.modules.templates.models import TemplateType, TemplateStatus
from app.modules.templates.services import TemplateService

router = APIRouter(prefix="/api/templates", tags=["templates"])


# ── 请求模型 ────────────────────────────────────────────────

class CreateTemplateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    type: TemplateType = TemplateType.CUSTOM
    school: Optional[str] = None
    department: Optional[str] = None
    journal_name: Optional[str] = None
    format_json: Optional[dict] = None
    source_file_url: Optional[str] = None
    is_public: int = 0


class UpdateTemplateRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    school: Optional[str] = None
    department: Optional[str] = None
    journal_name: Optional[str] = None
    format_json: Optional[dict] = None
    source_file_url: Optional[str] = None
    is_public: Optional[int] = None


class ReviewActionRequest(BaseModel):
    note: str = ""


# ── 辅助函数 ────────────────────────────────────────────────

def _template_to_dict(tpl) -> dict:
    return {
        "id": tpl.id,
        "name": tpl.name,
        "description": tpl.description,
        "type": tpl.type.value if tpl.type else None,
        "status": tpl.status.value if tpl.status else None,
        "school": tpl.school,
        "department": tpl.department,
        "journalName": tpl.journal_name,
        "formatJson": tpl.format_json,
        "sourceFileUrl": tpl.source_file_url,
        "createdBy": tpl.created_by,
        "isPublic": tpl.is_public,
        "reviewedBy": tpl.reviewed_by,
        "reviewNote": tpl.review_note,
        "createdAt": tpl.created_at.isoformat() if tpl.created_at else None,
        "updatedAt": tpl.updated_at.isoformat() if tpl.updated_at else None,
    }


# ── CRUD 端点 ────────────────────────────────────────────────

@router.post("")
def create_template(
    req: CreateTemplateRequest,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    tpl = TemplateService.create_template(
        name=req.name,
        user_id=current_user.user_id,
        description=req.description or "",
        template_type=req.type,
        school=req.school,
        department=req.department,
        journal_name=req.journal_name,
        format_json=req.format_json,
        source_file_url=req.source_file_url,
        is_public=req.is_public,
        db=db,
    )
    return ApiResponse.success("模板创建成功", _template_to_dict(tpl))


@router.get("")
def list_templates(
    type: Optional[TemplateType] = Query(None),
    status: Optional[TemplateStatus] = Query(None),
    school: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    items, total = TemplateService.list_templates(
        user_id=current_user.user_id,
        template_type=type,
        status=status,
        school=school,
        keyword=keyword,
        page=page,
        page_size=pageSize,
        db=db,
    )
    data = PageResponse.of(
        [_template_to_dict(t) for t in items], page, pageSize, total
    )
    return ApiResponse.success("获取模板列表成功", data)


@router.get("/{template_id}")
def get_template(
    template_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    tpl = TemplateService.get_template(template_id, db)
    return ApiResponse.success("获取模板详情成功", _template_to_dict(tpl))


@router.put("/{template_id}")
def update_template(
    template_id: str,
    req: UpdateTemplateRequest,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    tpl = TemplateService.update_template(
        template_id,
        current_user.user_id,
        name=req.name,
        description=req.description,
        school=req.school,
        department=req.department,
        journal_name=req.journal_name,
        format_json=req.format_json,
        source_file_url=req.source_file_url,
        is_public=req.is_public,
        db=db,
    )
    return ApiResponse.success("模板更新成功", _template_to_dict(tpl))


@router.delete("/{template_id}")
def delete_template(
    template_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    TemplateService.delete_template(template_id, current_user.user_id, db)
    return ApiResponse.success("模板已删除")


# ── 审核工作流 ──────────────────────────────────────────────

@router.post("/{template_id}/submit-review")
def submit_review(
    template_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    tpl = TemplateService.submit_for_review(template_id, current_user.user_id, db)
    return ApiResponse.success("模板已提交审核", _template_to_dict(tpl))


@router.post("/{template_id}/approve")
def approve_template(
    template_id: str,
    req: ReviewActionRequest = None,
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    note = req.note if req else ""
    tpl = TemplateService.approve_template(
        template_id, current_user.user_id, note=note, db=db,
    )
    return ApiResponse.success("模板已通过审核", _template_to_dict(tpl))


@router.post("/{template_id}/reject")
def reject_template(
    template_id: str,
    req: ReviewActionRequest = None,
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    note = req.note if req else ""
    tpl = TemplateService.reject_template(
        template_id, current_user.user_id, note=note, db=db,
    )
    return ApiResponse.success("模板已拒绝", _template_to_dict(tpl))
