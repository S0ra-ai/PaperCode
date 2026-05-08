"""Session endpoints: CRUD + workspace."""

from __future__ import annotations

from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session as DBSession

from app.platform.exceptions import BusinessException
from app.platform.response import ApiResponse
from app.platform.database import get_db
from app.modules.auth.deps import CurrentUser, require_approved
from app.modules.workspace.schemas.session import CreateSessionRequest, UpdateSessionRequest, SessionResponse
from app.modules.workspace.schemas.file import StoredFileResponse
from app.modules.workspace.services.session_service import SessionService
from app.modules.workspace.services.file_service import FileService
from app.modules.workspace.api.tasks import _task_to_dict

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("")
def create_session(
    req: CreateSessionRequest,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    session = SessionService.create_session(current_user.user_id, req.title, db)
    data = SessionResponse.model_validate(session).model_dump()
    return ApiResponse.success("会话创建成功", data)


@router.get("")
def list_sessions(
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    sessions = SessionService.list_sessions(current_user.user_id, db)
    data = [SessionResponse.model_validate(s).model_dump() for s in sessions]
    return ApiResponse.success("获取会话列表成功", data)


@router.get("/{session_id}")
def get_session(
    session_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    session = SessionService.verify_ownership(session_id, current_user.user_id, db)
    data = SessionResponse.model_validate(session).model_dump()
    return ApiResponse.success("获取会话成功", data)


@router.get("/{session_id}/workspace")
def get_workspace(
    session_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    workspace = SessionService.get_workspace(session_id, current_user.user_id, db)

    task_list = [_task_to_dict(t) for t in workspace["tasks"]]

    return ApiResponse.success("获取工作区成功", {
        "session": SessionResponse.model_validate(workspace["session"]).model_dump(),
        "tasks": task_list,
        "attachments": [StoredFileResponse.model_validate(a).model_dump() for a in workspace["attachments"]],
    })


@router.get("/{session_id}/attachments")
def list_attachments(
    session_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    attachments = SessionService.get_attachments(session_id, current_user.user_id, db)
    data = [StoredFileResponse.model_validate(a).model_dump() for a in attachments]
    return ApiResponse.success("获取附件列表成功", data)


@router.post("/{session_id}/attachments")
def add_attachment(
    session_id: str,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    SessionService.verify_ownership(session_id, current_user.user_id, db)

    if not file.filename:
        raise BusinessException(400, "文件名不能为空")

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    content = file.file.read()

    stored = FileService.save_file(
        content=content,
        filename=file.filename,
        user_id=current_user.user_id,
        ext=ext,
        db=db,
        session_id=session_id,
    )
    data = StoredFileResponse.model_validate(stored).model_dump()
    return ApiResponse.success("附件上传成功", data)


@router.delete("/{session_id}")
def delete_session(
    session_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    SessionService.delete_session(session_id, current_user.user_id, db)
    return ApiResponse.success("会话删除成功")


@router.patch("/{session_id}")
def update_session(
    session_id: str,
    req: UpdateSessionRequest,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    session = SessionService.update_title(session_id, current_user.user_id, req.title, db)
    data = SessionResponse.model_validate(session).model_dump()
    return ApiResponse.success("会话更新成功", data)
