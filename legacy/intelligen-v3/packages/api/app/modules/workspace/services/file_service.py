"""File service — save, delete, list, ownership helpers."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session as DBSession

from app.platform.config import settings
from app.platform.exceptions import BusinessException, NotFoundException
from app.modules.workspace.models.file import StoredFile


class FileService:

    @staticmethod
    def save_file(
        content: bytes,
        filename: str,
        user_id: str,
        ext: str,
        db: DBSession,
        session_id: str | None = None,
        *,
        validate: bool = True,
    ) -> StoredFile:
        """Persist *content* to disk and create a ``StoredFile`` row.

        When *validate* is ``True`` (default) extension allow-list and
        max-size checks are applied.
        """
        if validate:
            if ext and ext not in settings.allowed_extensions:
                raise BusinessException(400, f"不支持的文件类型: {ext}")
            if len(content) > settings.MAX_FILE_SIZE:
                raise BusinessException(400, "文件大小超过限制")

        file_id = str(uuid.uuid4())
        relative_dir = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        save_dir = os.path.join(settings.FILE_STORAGE_PATH, relative_dir)
        os.makedirs(save_dir, exist_ok=True)

        safe_name = f"{file_id}.{ext}" if ext else file_id
        save_path = os.path.join(save_dir, safe_name)
        with open(save_path, "wb") as f:
            f.write(content)

        file_url = f"{settings.FILE_PUBLIC_BASE_URL}/uploads/{relative_dir}/{safe_name}"

        stored = StoredFile(
            fileId=file_id,
            userId=user_id,
            fileName=filename,
            filePath=save_path,
            fileUrl=file_url,
            fileSize=len(content),
            fileType=ext,
            sourceSessionId=session_id,
        )
        db.add(stored)
        db.commit()
        db.refresh(stored)
        return stored

    @staticmethod
    def get_user_files(user_id: str, db: DBSession) -> list[StoredFile]:
        return (
            db.query(StoredFile)
            .filter(StoredFile.userId == user_id)
            .order_by(desc(StoredFile.createdAt))
            .all()
        )

    @staticmethod
    def get_owned_file(file_id: str, user_id: str, db: DBSession) -> StoredFile:
        """Return a file owned by *user_id* or raise ``NotFoundException``."""
        stored = (
            db.query(StoredFile)
            .filter(StoredFile.fileId == file_id, StoredFile.userId == user_id)
            .first()
        )
        if not stored:
            raise NotFoundException("文件不存在")
        return stored

    @staticmethod
    def delete_file(file_id: str, user_id: str, db: DBSession) -> None:
        stored = FileService.get_owned_file(file_id, user_id, db)
        if os.path.exists(stored.filePath):
            os.remove(stored.filePath)
        db.delete(stored)
        db.commit()
