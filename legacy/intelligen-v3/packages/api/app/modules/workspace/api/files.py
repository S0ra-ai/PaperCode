"""File endpoints: upload, list, get, delete."""

from __future__ import annotations

from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.orm import Session as DBSession

from app.platform.exceptions import BusinessException
from app.platform.response import ApiResponse
from app.platform.database import get_db
from app.modules.auth.deps import CurrentUser, require_approved
from app.modules.workspace.schemas.file import StoredFileResponse
from app.modules.workspace.services.file_service import FileService
from app.core.file_security import validate_upload

router = APIRouter(prefix="/files", tags=["files"])


@router.post("/upload")
def upload_file(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    if not file.filename:
        raise BusinessException(400, "文件名不能为空")

    content = file.file.read()

    # Calculate current user's total storage for quota check
    user_files = FileService.get_user_files(current_user.user_id, db)
    current_total = sum(f.fileSize or 0 for f in user_files)

    # Validate upload: extension, magic number, size, user quota
    try:
        safe_name = validate_upload(
            content=content,
            filename=file.filename,
            user_id=current_user.user_id,
            current_user_total=current_total,
        )
    except ValueError as e:
        raise BusinessException(400, str(e))

    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""

    stored = FileService.save_file(
        content=content,
        filename=safe_name,
        user_id=current_user.user_id,
        ext=ext,
        db=db,
        validate=False,  # Already validated above
    )
    data = StoredFileResponse.model_validate(stored).model_dump()
    return ApiResponse.success("上传成功", data)


@router.get("")
def list_files(
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    files = FileService.get_user_files(current_user.user_id, db)
    data = [StoredFileResponse.model_validate(f).model_dump() for f in files]
    return ApiResponse.success("获取文件列表成功", data)


@router.get("/{file_id}")
def get_file(
    file_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    stored = FileService.get_owned_file(file_id, current_user.user_id, db)
    data = StoredFileResponse.model_validate(stored).model_dump()
    return ApiResponse.success("获取文件成功", data)


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    current_user: CurrentUser = Depends(require_approved),
    db: DBSession = Depends(get_db),
):
    FileService.delete_file(file_id, current_user.user_id, db)
    return ApiResponse.success("删除成功")
