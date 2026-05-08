"""v3.1 新功能集成测试 — Admin / LLM Provider / Profile / 权限控制

覆盖: 管理后台, LLM 提供商 CRUD, 用户 Profile, 权限隔离
复用 test_api.py 中的基础设施 (TestClient, in-memory SQLite, helpers)
"""

from __future__ import annotations

import os
import sys
import uuid

os.environ.setdefault("JWT_SECRET", "dGVzdC1zZWNyZXQta2V5LWZvci1kZXY=")
os.environ.setdefault("DB_PASSWORD", "unused")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("ADMIN_BOOTSTRAP_USERNAME", "")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/ 目录

import pytest
from unittest.mock import patch, AsyncMock

from test_api import (
    client,
    _clean_tables as _base_clean,
    _create_approved_user,
    _auth_cookies,
    _create_session,
    TestingSessionLocal,
)
from app.modules.llm.models import LLMProvider, LLMStageConfig
from app.modules.admin.models_config import LLMModelConfig


@pytest.fixture(autouse=True)
def _clean_tables(_base_clean):
    """增强清理: 每个测试前确保存在 admin 以通过 SetupGuard"""
    # 在测试开始前创建占位 admin (满足 SetupGuard 的 _is_initialized 检查)
    _create_approved_user("__guard_admin__", "pwd", role="admin")
    yield
    # _base_clean 在其 yield 后删除所有用户


# ── Helpers ────────────────────────────────────────────────

def _admin_cookies() -> tuple[str, dict]:
    """创建管理员用户并返回 (user_id, cookies)"""
    uid, _ = _create_approved_user("admin_test", "admin123", role="admin")
    return uid, _auth_cookies(uid, "admin_test", "admin")


def _student_cookies() -> tuple[str, dict]:
    """创建普通用户并返回 (user_id, cookies)"""
    uid, _ = _create_approved_user("student_test", "pass123", role="student")
    return uid, _auth_cookies(uid, "student_test", "student")


def _insert_provider(name: str = "TestProvider", **overrides) -> str:
    """直接插入 LLM Provider 并返回 id"""
    pid = overrides.pop("id", str(uuid.uuid4()))
    db = TestingSessionLocal()
    try:
        p = LLMProvider(
            id=pid,
            name=name,
            api_format=overrides.get("api_format", "openai_compatible"),
            base_url=overrides.get("base_url", "https://api.test.com/v1"),
            models_json=overrides.get("models_json", ["gpt-4"]),
            is_active=overrides.get("is_active", True),
            priority=overrides.get("priority", 0),
        )
        db.add(p)
        db.commit()
    finally:
        db.close()
    return pid


# ══════════════════════════════════════════════════════════════
#  权限控制 — 普通用户不能访问 admin 端点
# ══════════════════════════════════════════════════════════════

class TestAdminPermissions:
    """验证 admin 端点拒绝非管理员"""

    def test_dashboard_requires_admin(self, client):
        _, cookies = _student_cookies()
        resp = client.get("/admin/dashboard", cookies=cookies)
        assert resp.json()["code"] == 403

    def test_users_list_requires_admin(self, client):
        _, cookies = _student_cookies()
        resp = client.get("/admin/users/pending", cookies=cookies)
        assert resp.json()["code"] == 403

    def test_audit_logs_requires_admin(self, client):
        _, cookies = _student_cookies()
        resp = client.get("/admin/audit-logs", cookies=cookies)
        assert resp.json()["code"] == 403

    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/admin/dashboard")
        assert resp.json()["code"] == 401


# ══════════════════════════════════════════════════════════════
#  Admin 仪表盘
# ══════════════════════════════════════════════════════════════

class TestAdminDashboard:
    def test_dashboard_returns_stats(self, client):
        _, cookies = _admin_cookies()
        resp = client.get("/admin/dashboard", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        data = body["data"]
        # 仪表盘返回的字段名取决于 API 实现
        assert isinstance(data, dict)
        assert len(data) > 0  # 至少有一些统计数据

    def test_users_list(self, client):
        _, cookies = _admin_cookies()
        _create_approved_user("someuser", "pass", role="student")
        resp = client.get("/admin/users/pending", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["total"] >= 1


# ══════════════════════════════════════════════════════════════
#  用户审核
# ══════════════════════════════════════════════════════════════

class TestUserAudit:
    def test_audit_approve_user(self, client):
        _, admin_cookies = _admin_cookies()
        uid, _ = _create_approved_user("pendinguser", "pass", role="student")

        # 设置为待审核
        db = TestingSessionLocal()
        from app.modules.auth.models import User
        user = db.query(User).filter(User.userId == uid).first()
        user.authStatus = 0
        db.commit()
        db.close()

        resp = client.put(
            f"/admin/users/{uid}/audit",
            json={"authStatus": 1},
            cookies=admin_cookies,
        )
        assert resp.json()["code"] == 200

    def test_audit_nonexistent_user(self, client):
        _, admin_cookies = _admin_cookies()
        resp = client.put(
            f"/admin/users/fake-uuid/audit",
            json={"authStatus": 1},
            cookies=admin_cookies,
        )
        assert resp.json()["code"] == 404

    def test_admin_delete_session(self, client):
        admin_uid, admin_cookies = _admin_cookies()
        user_uid, _ = _create_approved_user("sessionowner", "pass")
        sid = _create_session(user_uid, "To be deleted")

        resp = client.delete(f"/admin/sessions/{sid}", cookies=admin_cookies)
        assert resp.json()["code"] == 200

    def test_admin_delete_nonexistent_session(self, client):
        _, admin_cookies = _admin_cookies()
        resp = client.delete("/admin/sessions/fake-id", cookies=admin_cookies)
        assert resp.json()["code"] == 404


# ══════════════════════════════════════════════════════════════
#  LLM Provider CRUD
# ══════════════════════════════════════════════════════════════

class TestLLMProviders:
    def test_list_providers(self, client):
        _, cookies = _admin_cookies()
        _insert_provider("Provider A")
        resp = client.get("/admin/providers", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert len(body["data"]) >= 1

    def test_create_provider(self, client):
        _, cookies = _admin_cookies()
        resp = client.post("/admin/providers", json={
            "name": "NewProvider",
            "api_format": "openai_compatible",
            "base_url": "https://api.new.com/v1",
            "models_json": ["gpt-4", "gpt-3.5"],
            "priority": 10,
        }, cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["name"] == "NewProvider"

    def test_create_duplicate_provider(self, client):
        _, cookies = _admin_cookies()
        _insert_provider("DupProvider")
        resp = client.post("/admin/providers", json={
            "name": "DupProvider",
            "api_format": "openai_compatible",
            "base_url": "https://api.dup.com/v1",
        }, cookies=cookies)
        assert resp.json()["code"] == 400

    def test_update_provider(self, client):
        _, cookies = _admin_cookies()
        pid = _insert_provider("UpdateMe")
        resp = client.put(f"/admin/providers/{pid}", json={
            "name": "Updated",
            "base_url": "https://api.updated.com/v1",
        }, cookies=cookies)
        assert resp.json()["code"] == 200
        assert resp.json()["data"]["name"] == "Updated"

    def test_delete_provider(self, client):
        _, cookies = _admin_cookies()
        pid = _insert_provider("DeleteMe")
        resp = client.delete(f"/admin/providers/{pid}", cookies=cookies)
        assert resp.json()["code"] == 200

    def test_delete_nonexistent_provider(self, client):
        _, cookies = _admin_cookies()
        resp = client.delete("/admin/providers/fake-id", cookies=cookies)
        assert resp.json()["code"] == 404

    def test_provider_crud_requires_admin(self, client):
        _, cookies = _student_cookies()
        resp = client.get("/admin/providers", cookies=cookies)
        assert resp.json()["code"] == 403


# ══════════════════════════════════════════════════════════════
#  Profile 端点
# ══════════════════════════════════════════════════════════════

class TestProfile:
    def test_get_profile(self, client):
        uid, _ = _create_approved_user("profileuser", "pass")
        cookies = _auth_cookies(uid, "profileuser")
        resp = client.get("/auth/profile", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["username"] == "profileuser"

    def test_update_profile(self, client):
        uid, _ = _create_approved_user("edituser", "pass")
        cookies = _auth_cookies(uid, "edituser")
        resp = client.put("/auth/profile", json={
            "nickname": "新昵称",
            "email": "new@test.com",
            "institution": "清华大学",
        }, cookies=cookies)
        body = resp.json()
        assert body["code"] == 200

        # 验证更新生效
        resp2 = client.get("/auth/profile", cookies=cookies)
        assert resp2.json()["data"]["nickname"] == "新昵称"

    def test_change_password(self, client):
        uid, pw = _create_approved_user("pwuser", "oldpass123")
        cookies = _auth_cookies(uid, "pwuser")
        resp = client.put("/auth/password", json={
            "oldPassword": "oldpass123",
            "newPassword": "newpass456",
        }, cookies=cookies)
        assert resp.json()["code"] == 200

        # 旧密码登录应失败
        resp2 = client.post("/auth/login", json={
            "username": "pwuser",
            "password": "oldpass123",
        })
        assert resp2.json()["code"] != 200

    def test_change_password_wrong_old(self, client):
        uid, _ = _create_approved_user("pw2user", "correct")
        cookies = _auth_cookies(uid, "pw2user")
        resp = client.put("/auth/password", json={
            "oldPassword": "wrong",
            "newPassword": "new123",
        }, cookies=cookies)
        assert resp.json()["code"] != 200

    def test_profile_requires_auth(self, client):
        resp = client.get("/auth/profile")
        assert resp.json()["code"] == 401


# ══════════════════════════════════════════════════════════════
#  审计日志
# ══════════════════════════════════════════════════════════════

class TestAuditLogs:
    def test_list_audit_logs(self, client):
        _, cookies = _admin_cookies()
        resp = client.get("/admin/audit-logs", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert "total" in body["data"]

    def test_audit_logs_pagination(self, client):
        _, cookies = _admin_cookies()
        resp = client.get("/admin/audit-logs?page=1&pageSize=5", cookies=cookies)
        body = resp.json()
        assert body["code"] == 200
        assert body["data"]["pageSize"] == 5


# ══════════════════════════════════════════════════════════════
#  错误处理 — 友好中文消息
# ══════════════════════════════════════════════════════════════

class TestErrorHandling:
    def test_401_unauthenticated(self, client):
        resp = client.get("/auth/profile")
        body = resp.json()
        assert body["code"] == 401
        assert "登录" in body["message"]

    def test_403_non_admin(self, client):
        _, cookies = _student_cookies()
        resp = client.get("/admin/dashboard", cookies=cookies)
        body = resp.json()
        assert body["code"] == 403

    def test_404_not_found(self, client):
        _, cookies = _admin_cookies()
        resp = client.delete("/admin/sessions/nonexistent", cookies=cookies)
        assert resp.json()["code"] == 404

    def test_bad_login(self, client):
        resp = client.post("/auth/login", json={
            "username": "nobody",
            "password": "wrong",
        })
        assert resp.json()["code"] != 200
