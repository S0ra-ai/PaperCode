"""API integration tests — FastAPI TestClient + in-memory SQLite.

Covers: auth, sessions, files, tasks, health.
"""

from __future__ import annotations

import os
import shutil
import sys
import threading
import uuid
import asyncio
import json
from datetime import datetime, timezone
from decimal import Decimal

# ── Environment must be configured BEFORE any app imports ──────────────
os.environ.setdefault("JWT_SECRET", "dGVzdC1zZWNyZXQta2V5LWZvci1kZXY=")
os.environ.setdefault("DB_PASSWORD", "unused")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("ADMIN_BOOTSTRAP_USERNAME", "")  # disable bootstrap

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

# ── SQLite dialect adapters ────────────────────────────────────────────
# Must register BEFORE model metadata is reflected.
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.mysql import LONGTEXT
from sqlalchemy import BigInteger

@compiles(LONGTEXT, "sqlite")
def _compile_longtext_sqlite(element, compiler, **kw):
    return "TEXT"

# BigInteger autoincrement doesn't work on SQLite — compile to INTEGER
@compiles(BigInteger, "sqlite")
def _compile_bigint_sqlite(element, compiler, **kw):
    return "INTEGER"


# ── App imports (after env is configured) ──────────────────────────────
from app.platform.database import Base, get_db
from app.modules.workspace.api import tasks as task_api
from app.modules.auth.deps import CurrentUser
from app.platform.security import create_access_token, hash_password
from app.modules.auth.models import User
from app.modules.workspace.models.session import Session
from app.modules.workspace.models.task import GenerateTask, GenerateTaskFile
from app.modules.workspace.models.file import StoredFile
from app.platform.models.audit import OperationLog, AdminAccessLog
from app.modules.generation.models import TaskExecution, SectionCheckpoint
from app.modules.workspace.services.task_service import TaskRuntimeController, TaskService

# ── Test DB engine (shared in-memory via StaticPool) ───────────────────
_test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Enable SQLite foreign keys
@event.listens_for(_test_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=_test_engine)

# Upload temp directory (project-local, not /tmp)
_UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "_test_uploads")


def _override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Fixtures ───────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def client():
    """Create TestClient with all patches applied."""
    os.makedirs(_UPLOAD_DIR, exist_ok=True)

    # Patch settings BEFORE app uses them
    from app.platform.config import settings
    _original_storage = settings.FILE_STORAGE_PATH
    settings.FILE_STORAGE_PATH = _UPLOAD_DIR

    # Patch SessionLocal in every module that imports it directly
    with (
        patch("app.main.SessionLocal", TestingSessionLocal),
        patch("app.platform.middleware.SessionLocal", TestingSessionLocal),
        patch("app.modules.workspace.services.task_service.SessionLocal", TestingSessionLocal),
    ):
        from app.main import app

        # Override the FastAPI dependency
        app.dependency_overrides[get_db] = _override_get_db

        # Create all tables
        Base.metadata.create_all(bind=_test_engine)

        with TestClient(app) as tc:
            yield tc

        # Teardown
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=_test_engine)

    settings.FILE_STORAGE_PATH = _original_storage
    if os.path.exists(_UPLOAD_DIR):
        shutil.rmtree(_UPLOAD_DIR, ignore_errors=True)


@pytest.fixture(autouse=True)
def _clean_tables():
    """Truncate mutable tables between tests for isolation."""
    yield
    db = TestingSessionLocal()
    try:
        # Order matters due to FK constraints
        db.query(GenerateTaskFile).delete()
        db.query(SectionCheckpoint).delete()
        db.query(TaskExecution).delete()
        db.query(GenerateTask).delete()
        db.query(StoredFile).delete()
        db.query(Session).delete()
        db.query(OperationLog).delete()
        db.query(AdminAccessLog).delete()
        db.query(User).delete()
        db.commit()
    finally:
        db.close()


# ── Helpers ────────────────────────────────────────────────────────────

def _create_approved_user(
    username: str = "testuser",
    password: str = "password123",
    role: str = "student",
) -> tuple[str, str]:
    """Insert an approved user and return (user_id, raw_password)."""
    uid = str(uuid.uuid4())
    db = TestingSessionLocal()
    try:
        user = User(
            userId=uid,
            username=username,
            password=hash_password(password),
            nickname=f"Test {username}",
            email=f"{username}@test.com",
            role=role,
            authStatus=1,
        )
        db.add(user)
        db.commit()
    finally:
        db.close()
    return uid, password


def _auth_cookies(user_id: str, username: str = "testuser", role: str = "student") -> dict:
    """Return cookie dict for an authenticated request."""
    token = create_access_token(username, user_id, role)
    return {"access_token": token}


def _create_session(user_id: str, title: str = "Test Session") -> str:
    """Insert a session directly and return session_id."""
    sid = str(uuid.uuid4())
    db = TestingSessionLocal()
    try:
        session = Session(sessionId=sid, userId=user_id, title=title)
        db.add(session)
        db.commit()
    finally:
        db.close()
    return sid


def _read_sse_payload(line_iterator) -> dict:
    for raw_line in line_iterator:
        line = raw_line.decode("utf-8") if isinstance(raw_line, bytes) else raw_line
        if not line or line.startswith(":"):
            continue
        if line.startswith("data: "):
            return json.loads(line[6:])
    raise AssertionError("Expected SSE payload but stream ended")


def _parse_sse_chunk(chunk: str | bytes) -> dict:
    text = chunk.decode("utf-8") if isinstance(chunk, bytes) else chunk
    for line in text.splitlines():
        if line.startswith("data: "):
            return json.loads(line[6:])
    raise AssertionError(f"Expected SSE data chunk, got: {text!r}")


# ══════════════════════════════════════════════════════════════════════
#  HEALTH
# ══════════════════════════════════════════════════════════════════════

class TestHealth:
    def test_health_returns_up(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "UP"


# ══════════════════════════════════════════════════════════════════════
#  AUTH
# ══════════════════════════════════════════════════════════════════════

class TestAuth:
    def test_register_success(self, client):
        resp = client.post("/auth/register", json={
            "username": "newuser",
            "password": "secret123",
            "nickname": "New User",
            "email": "new@test.com",
            "role": "student",
        })
        body = resp.json()
        assert resp.status_code == 200
        assert body["code"] == 200
        assert body["data"]["username"] == "newuser"
        assert body["data"]["authStatus"] == 0  # pending

    def test_register_duplicate_username(self, client):
        _create_approved_user("dupuser")
        resp = client.post("/auth/register", json={
            "username": "dupuser",
            "password": "secret123",
            "nickname": "Dup",
            "email": "dup@test.com",
            "role": "student",
        })
        body = resp.json()
        assert body["code"] == 400

    def test_login_success(self, client):
        uid, pw = _create_approved_user("loginuser")
        resp = client.post("/auth/login", json={
            "username": "loginuser",
            "password": pw,
        })
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["username"] == "loginuser"
        # Cookie should be set
        assert "access_token" in resp.cookies

    def test_login_wrong_password(self, client):
        _create_approved_user("wrongpw")
        resp = client.post("/auth/login", json={
            "username": "wrongpw",
            "password": "badpassword",
        })
        body = resp.json()
        assert body["code"] == 400

    def test_login_pending_user(self, client):
        """Users with authStatus=0 cannot log in."""
        uid = str(uuid.uuid4())
        db = TestingSessionLocal()
        try:
            user = User(
                userId=uid, username="pending", password=hash_password("pass123"),
                nickname="Pending", email="p@test.com", role="student", authStatus=0,
            )
            db.add(user)
            db.commit()
        finally:
            db.close()

        resp = client.post("/auth/login", json={
            "username": "pending",
            "password": "pass123",
        })
        assert resp.json()["code"] == 403

    def test_logout(self, client):
        uid, _ = _create_approved_user("logoutuser")
        cookies = _auth_cookies(uid, "logoutuser")
        resp = client.post("/auth/logout", cookies=cookies)
        assert resp.json()["code"] == 200

    def test_userinfo_authenticated(self, client):
        uid, _ = _create_approved_user("infouser")
        cookies = _auth_cookies(uid, "infouser")
        resp = client.get("/auth/userinfo", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["userId"] == uid

    def test_userinfo_unauthenticated(self, client):
        resp = client.get("/auth/userinfo")
        body = resp.json()
        assert body["code"] == 401


# ══════════════════════════════════════════════════════════════════════
#  SESSIONS
# ══════════════════════════════════════════════════════════════════════

class TestSessions:
    def test_create_session(self, client):
        uid, _ = _create_approved_user()
        cookies = _auth_cookies(uid)
        resp = client.post("/sessions", json={"title": "My Session"}, cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["title"] == "My Session"
        assert body["data"]["userId"] == uid

    def test_list_sessions_only_own(self, client):
        uid1, _ = _create_approved_user("user1")
        uid2, _ = _create_approved_user("user2")
        _create_session(uid1, "Session A")
        _create_session(uid2, "Session B")

        cookies = _auth_cookies(uid1, "user1")
        resp = client.get("/sessions", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        titles = [s["title"] for s in body["data"]]
        assert "Session A" in titles
        assert "Session B" not in titles

    def test_get_session(self, client):
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)
        resp = client.get(f"/sessions/{sid}", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["sessionId"] == sid

    def test_get_session_not_found(self, client):
        uid, _ = _create_approved_user()
        cookies = _auth_cookies(uid)
        resp = client.get(f"/sessions/{uuid.uuid4()}", cookies=cookies)
        assert resp.json()["code"] == 404

    def test_get_workspace(self, client):
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)
        resp = client.get(f"/sessions/{sid}/workspace", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert "session" in body["data"]
        assert "tasks" in body["data"]
        assert "attachments" in body["data"]

    def test_delete_session(self, client):
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)

        resp = client.delete(f"/sessions/{sid}", cookies=cookies)
        assert resp.json()["code"] == 200

        # Confirm deleted
        resp = client.get(f"/sessions/{sid}", cookies=cookies)
        assert resp.json()["code"] == 404

    def test_delete_nonexistent_session(self, client):
        uid, _ = _create_approved_user()
        cookies = _auth_cookies(uid)
        resp = client.delete(f"/sessions/{uuid.uuid4()}", cookies=cookies)
        assert resp.json()["code"] == 404


# ══════════════════════════════════════════════════════════════════════
#  FILES
# ══════════════════════════════════════════════════════════════════════

class TestFiles:
    def test_upload_file(self, client):
        uid, _ = _create_approved_user()
        cookies = _auth_cookies(uid)
        resp = client.post(
            "/files/upload",
            files={"file": ("report.txt", b"hello world", "text/plain")},
            cookies=cookies,
        )
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["fileName"] == "report.txt"
        assert body["data"]["fileType"] == "txt"
        assert body["data"]["fileSize"] == len(b"hello world")

    def test_list_files(self, client):
        uid, _ = _create_approved_user()
        cookies = _auth_cookies(uid)
        # Upload one file first
        client.post(
            "/files/upload",
            files={"file": ("a.txt", b"data", "text/plain")},
            cookies=cookies,
        )
        resp = client.get("/files", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert len(body["data"]) >= 1

    def test_get_file(self, client):
        uid, _ = _create_approved_user()
        cookies = _auth_cookies(uid)
        upload = client.post(
            "/files/upload",
            files={"file": ("b.txt", b"data", "text/plain")},
            cookies=cookies,
        ).json()
        file_id = upload["data"]["fileId"]

        resp = client.get(f"/files/{file_id}", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["fileId"] == file_id

    def test_delete_file(self, client):
        uid, _ = _create_approved_user()
        cookies = _auth_cookies(uid)
        upload = client.post(
            "/files/upload",
            files={"file": ("del.txt", b"data", "text/plain")},
            cookies=cookies,
        ).json()
        file_id = upload["data"]["fileId"]

        resp = client.delete(f"/files/{file_id}", cookies=cookies)
        assert resp.json()["code"] == 200

        # Confirm deleted
        resp = client.get(f"/files/{file_id}", cookies=cookies)
        assert resp.json()["code"] == 404

    def test_upload_invalid_extension(self, client):
        uid, _ = _create_approved_user()
        cookies = _auth_cookies(uid)
        resp = client.post(
            "/files/upload",
            files={"file": ("virus.exe", b"bad", "application/octet-stream")},
            cookies=cookies,
        )
        body = resp.json()
        assert body["code"] == 400


# ══════════════════════════════════════════════════════════════════════
#  TASKS
# ══════════════════════════════════════════════════════════════════════

class TestTasks:
    def test_create_task(self, client):
        """Create a task — mock _run_generation to avoid LLM calls."""
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)

        with patch("app.modules.workspace.services.task_service.TaskService.runtime.submit") as mock_submit:
            mock_submit.return_value = MagicMock()
            resp = client.post(f"/sessions/{sid}/tasks", json={
                "userInput": "Generate a report about AI",
                "fileIds": [],
            }, cookies=cookies)

        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["status"] == "pending"
        assert body["data"]["userInput"] == "Generate a report about AI"
        assert body["data"]["sessionId"] == sid
        mock_submit.assert_called_once()
        submitted_task_id, submitted_job, *submitted_args = mock_submit.call_args[0]
        assert submitted_task_id == body["data"]["taskId"]
        assert submitted_job == TaskService._run_generation
        assert submitted_args[0] == body["data"]["taskId"]

    def test_list_tasks(self, client):
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)

        with patch("app.modules.workspace.services.task_service.TaskService.runtime.submit") as mock_submit:
            mock_submit.return_value = MagicMock()
            client.post(f"/sessions/{sid}/tasks", json={
                "userInput": "Task 1",
                "fileIds": [],
            }, cookies=cookies)
            client.post(f"/sessions/{sid}/tasks", json={
                "userInput": "Task 2",
                "fileIds": [],
            }, cookies=cookies)

        resp = client.get(f"/sessions/{sid}/tasks", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert len(body["data"]) == 2

    def test_get_task_status(self, client):
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)

        with patch("app.modules.workspace.services.task_service.TaskService.runtime.submit") as mock_submit:
            mock_submit.return_value = MagicMock()
            create_resp = client.post(f"/sessions/{sid}/tasks", json={
                "userInput": "Status check",
                "fileIds": [],
            }, cookies=cookies)
        task_id = create_resp.json()["data"]["taskId"]

        resp = client.get(f"/tasks/{task_id}", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["taskId"] == task_id

    def test_task_progress_stream_emits_initial_and_terminal_updates(self, client):
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)

        with patch("app.modules.workspace.services.task_service.TaskService.runtime.submit") as mock_submit:
            mock_submit.return_value = MagicMock()
            create_resp = client.post(
                f"/sessions/{sid}/tasks",
                json={"userInput": "Stream check", "fileIds": []},
                cookies=cookies,
            )
        task_id = create_resp.json()["data"]["taskId"]

        class _TestRequest:
            async def is_disconnected(self):
                return False

        async def _read_stream_events():
            db = TestingSessionLocal()
            try:
                current_user = CurrentUser(uid, "testuser", "student")
                response = await task_api.stream_task_progress(
                    task_id=task_id,
                    request=_TestRequest(),
                    current_user=current_user,
                    db=db,
                )
                assert response.media_type == "text/event-stream"

                initial_chunk = await anext(response.body_iterator)

                progress_db = TestingSessionLocal()
                try:
                    task = progress_db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
                    task.status = "processing"
                    task.progress = Decimal("50.00")
                    task.currentSection = 1
                    task.totalSections = 2
                    progress_db.commit()
                    progress_db.refresh(task)
                    TaskService.publish_task_event(task)
                finally:
                    progress_db.close()

                progress_chunk = await asyncio.wait_for(anext(response.body_iterator), timeout=1)

                terminal_db = TestingSessionLocal()
                try:
                    task = terminal_db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
                    task.status = "failed"
                    task.errorMessage = "生成引擎暂时不可用，请稍后重试。"
                    task.completedAt = datetime.now(timezone.utc)
                    terminal_db.commit()
                    terminal_db.refresh(task)
                    TaskService.publish_task_event(task, error_category="engine_unavailable")
                finally:
                    terminal_db.close()

                terminal_chunk = await asyncio.wait_for(anext(response.body_iterator), timeout=1)
                await response.body_iterator.aclose()
                return initial_chunk, progress_chunk, terminal_chunk
            finally:
                db.close()

        initial_chunk, progress_chunk, terminal_chunk = asyncio.run(_read_stream_events())

        initial_event = _parse_sse_chunk(initial_chunk)
        assert initial_event["taskId"] == task_id
        assert initial_event["status"] == "pending"
        assert initial_event["sessionId"] == sid

        progress_event = _parse_sse_chunk(progress_chunk)
        assert progress_event["status"] == "processing"
        assert progress_event["progress"] == 50.0
        assert progress_event["currentSection"] == 1
        assert progress_event["totalSections"] == 2

        terminal_event = _parse_sse_chunk(terminal_chunk)
        assert terminal_event["status"] == "failed"
        assert terminal_event["errorCategory"] == "engine_unavailable"
        assert terminal_event["errorMessage"] == "生成引擎暂时不可用，请稍后重试。"

    def test_download_markdown(self, client):
        """Set resultMarkdown directly, then download."""
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)

        with patch("app.modules.workspace.services.task_service.TaskService.runtime.submit") as mock_submit:
            mock_submit.return_value = MagicMock()
            create_resp = client.post(f"/sessions/{sid}/tasks", json={
                "userInput": "Download test",
                "fileIds": [],
            }, cookies=cookies)
        task_id = create_resp.json()["data"]["taskId"]

        # Manually set result in DB
        db = TestingSessionLocal()
        try:
            task = db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
            task.status = "completed"
            task.resultMarkdown = "# Test Report\n\nThis is the content."
            db.commit()
        finally:
            db.close()

        resp = client.get(f"/tasks/{task_id}/download?format=md", cookies=cookies)
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "text/markdown; charset=utf-8"
        assert b"# Test Report" in resp.content

    def test_download_no_result(self, client):
        """Download should fail when task has no resultMarkdown."""
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)

        with patch("app.modules.workspace.services.task_service.TaskService.runtime.submit") as mock_submit:
            mock_submit.return_value = MagicMock()
            create_resp = client.post(f"/sessions/{sid}/tasks", json={
                "userInput": "No result",
                "fileIds": [],
            }, cookies=cookies)
        task_id = create_resp.json()["data"]["taskId"]

        resp = client.get(f"/tasks/{task_id}/download?format=md", cookies=cookies)
        assert resp.json()["code"] == 400

    def test_create_task_for_nonexistent_session(self, client):
        uid, _ = _create_approved_user()
        cookies = _auth_cookies(uid)
        fake_sid = str(uuid.uuid4())

        with patch("app.modules.workspace.services.task_service.TaskService.runtime.submit") as mock_submit:
            mock_submit.return_value = MagicMock()
            resp = client.post(f"/sessions/{fake_sid}/tasks", json={
                "userInput": "Orphan task",
                "fileIds": [],
            }, cookies=cookies)

        assert resp.json()["code"] == 404

    def test_runtime_controller_tracks_running_task_ids(self):
        runtime = TaskRuntimeController(max_workers=1)
        started = threading.Event()
        release = threading.Event()

        def job():
            started.set()
            release.wait(timeout=2)

        future = runtime.submit("task-1", job)

        assert started.wait(timeout=1)
        assert runtime.is_running("task-1")
        assert "task-1" in runtime.running_task_ids()

        release.set()
        future.result(timeout=1)
        assert not runtime.is_running("task-1")
        runtime._executor.shutdown(wait=True)

    def test_create_task_persists_sanitized_error_message(self, client):
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)

        def run_immediately(task_id, job, *args):
            job(*args)
            return MagicMock()

        with patch(
            "app.modules.workspace.services.task_service.TaskService.runtime.submit",
            side_effect=run_immediately,
        ), patch(
            "app.modules.generation.services.generation_bridge.run_report_generation",
            side_effect=RuntimeError("OpenRouter timeout at C:\\provider\\raw.log"),
        ):
            create_resp = client.post(
                f"/sessions/{sid}/tasks",
                json={"userInput": "Fail task", "fileIds": []},
                cookies=cookies,
            )

        task_id = create_resp.json()["data"]["taskId"]
        resp = client.get(f"/tasks/{task_id}", cookies=cookies)
        body = resp.json()

        assert body["code"] == 200
        assert body["data"]["status"] == "failed"
        assert body["data"]["errorMessage"] == "生成引擎暂时不可用，请稍后重试。"
        assert body["data"]["errorCategory"] == "engine_unavailable"
        assert "OpenRouter" not in body["data"]["errorMessage"]

    def test_regenerate_section_returns_sanitized_error(self, client):
        uid, _ = _create_approved_user()
        sid = _create_session(uid)
        cookies = _auth_cookies(uid)

        with patch("app.modules.workspace.services.task_service.TaskService.runtime.submit") as mock_submit:
            mock_submit.return_value = MagicMock()
            create_resp = client.post(
                f"/sessions/{sid}/tasks",
                json={"userInput": "Regenerate test", "fileIds": []},
                cookies=cookies,
            )

        task_id = create_resp.json()["data"]["taskId"]

        db = TestingSessionLocal()
        try:
            task = db.query(GenerateTask).filter(GenerateTask.taskId == task_id).first()
            task.status = "completed"
            task.resultMarkdown = "# 引言\n\n原始内容"
            db.commit()
        finally:
            db.close()

        with patch(
            "app.modules.generation.services.generation_bridge.regenerate_section",
            side_effect=RuntimeError("OpenRouter timeout at C:\\provider\\raw.log"),
        ):
            resp = client.post(
                f"/tasks/{task_id}/sections/0/regenerate",
                json={},
                cookies=cookies,
            )

        body = resp.json()
        assert body["code"] == 503
        assert body["message"] == "生成引擎暂时不可用，请稍后重试。"
        assert "OpenRouter" not in body["message"]
