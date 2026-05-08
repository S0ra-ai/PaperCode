"""Session service — ownership verification, CRUD, workspace."""

from __future__ import annotations

import uuid

from sqlalchemy import desc
from sqlalchemy.orm import Session as DBSession, joinedload

from app.platform.exceptions import NotFoundException
from app.modules.workspace.models.session import Session
from app.modules.workspace.models.task import GenerateTask
from app.modules.workspace.models.file import StoredFile


class SessionService:

    @staticmethod
    def verify_ownership(session_id: str, user_id: str, db: DBSession) -> Session:
        """Return the session if it belongs to *user_id*, else raise."""
        session = (
            db.query(Session)
            .filter(Session.sessionId == session_id, Session.userId == user_id)
            .first()
        )
        if not session:
            raise NotFoundException("会话不存在")
        return session

    @staticmethod
    def create_session(user_id: str, title: str, db: DBSession) -> Session:
        session = Session(
            sessionId=str(uuid.uuid4()),
            userId=user_id,
            title=title,
        )
        db.add(session)
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def list_sessions(user_id: str, db: DBSession) -> list[Session]:
        return (
            db.query(Session)
            .filter(Session.userId == user_id)
            .order_by(desc(Session.updatedAt))
            .all()
        )

    @staticmethod
    def update_title(session_id: str, user_id: str, title: str, db: DBSession) -> Session:
        """Rename a session."""
        session = SessionService.verify_ownership(session_id, user_id, db)
        session.title = title
        db.commit()
        db.refresh(session)
        return session

    @staticmethod
    def auto_title_from_task(session_id: str, user_input: str, db: DBSession) -> None:
        """Auto-rename session if it still has the default title '新对话'."""
        session = db.query(Session).filter(Session.sessionId == session_id).first()
        if session and session.title == "新对话":
            # Use first 30 chars of user input as title
            session.title = user_input[:30].strip() or "新对话"
            db.commit()

    @staticmethod
    def delete_session(session_id: str, user_id: str, db: DBSession) -> None:
        session = SessionService.verify_ownership(session_id, user_id, db)
        db.delete(session)
        db.commit()

    @staticmethod
    def get_workspace(session_id: str, user_id: str, db: DBSession) -> dict:
        """Return session, tasks, and attachments for a workspace view."""
        session = SessionService.verify_ownership(session_id, user_id, db)

        tasks = (
            db.query(GenerateTask)
            .options(joinedload(GenerateTask.task_files))
            .filter(GenerateTask.sessionId == session_id)
            .order_by(desc(GenerateTask.createdAt))
            .all()
        )
        attachments = (
            db.query(StoredFile)
            .filter(StoredFile.sourceSessionId == session_id)
            .order_by(desc(StoredFile.createdAt))
            .all()
        )
        return {
            "session": session,
            "tasks": tasks,
            "attachments": attachments,
        }

    @staticmethod
    def get_attachments(session_id: str, user_id: str, db: DBSession) -> list[StoredFile]:
        SessionService.verify_ownership(session_id, user_id, db)
        return (
            db.query(StoredFile)
            .filter(StoredFile.sourceSessionId == session_id)
            .order_by(desc(StoredFile.createdAt))
            .all()
        )
