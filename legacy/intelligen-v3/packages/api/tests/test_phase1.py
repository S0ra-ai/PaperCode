"""Tests for Phase 1: auth, sessions, files, admin — using FastAPI TestClient."""

import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

# Set test env before importing app
os.environ["JWT_SECRET"] = "dGVzdC1zZWNyZXQta2V5LWZvci1kZXY="
os.environ["DB_PASSWORD"] = "test_not_used"
os.environ["DB_HOST"] = "localhost"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.platform.security import (
    hash_password, verify_password, create_access_token, verify_token,
)


class TestSecurity:
    def test_hash_and_verify(self):
        pw = hash_password("mypassword")
        assert verify_password("mypassword", pw)
        assert not verify_password("wrong", pw)

    def test_java_bcrypt_compat(self):
        """Java uses $2a$ prefix, Python bcrypt uses $2b$. verify_password handles this."""
        pw = hash_password("test123")
        # Simulate Java-style hash by replacing prefix
        java_hash = "$2a$" + pw[4:]
        assert verify_password("test123", java_hash)

    def test_jwt_create_and_verify(self):
        token = create_access_token("alice", "uid-001", "student")
        claims = verify_token(token)
        assert claims is not None
        assert claims["sub"] == "alice"
        assert claims["userId"] == "uid-001"
        assert claims["role"] == "student"

    def test_jwt_invalid_token(self):
        assert verify_token("invalid.token.here") is None

    def test_jwt_expired_token(self):
        """Tokens with past expiry should fail verification."""
        from datetime import datetime, timedelta, timezone
        from jose import jwt as jose_jwt
        payload = {
            "sub": "bob",
            "userId": "uid-002",
            "role": "user",
            "iat": datetime.now(timezone.utc) - timedelta(hours=48),
            "exp": datetime.now(timezone.utc) - timedelta(hours=24),
        }
        import base64
        secret = base64.b64decode(os.environ["JWT_SECRET"]).decode("utf-8")
        token = jose_jwt.encode(payload, secret, algorithm="HS256")
        assert verify_token(token) is None


class TestResponseFormat:
    def test_api_response_success(self):
        from app.platform.response import ApiResponse
        r = ApiResponse.success("ok", {"key": "val"})
        assert r == {"code": 200, "message": "ok", "data": {"key": "val"}}

    def test_api_response_failure(self):
        from app.platform.response import ApiResponse
        r = ApiResponse.failure(404, "not found")
        assert r == {"code": 404, "message": "not found", "data": None}

    def test_page_response(self):
        from app.platform.response import PageResponse
        r = PageResponse.of([1, 2, 3], page=1, page_size=10, total=3)
        assert r["list"] == [1, 2, 3]
        assert r["page"] == 1
        assert r["pageSize"] == 10
        assert r["total"] == 3


class TestSchemas:
    def test_register_request_validation(self):
        from app.modules.auth.schemas import RegisterRequest
        req = RegisterRequest(
            username="test", password="123456",
            nickname="Test", email="test@example.com", role="student"
        )
        assert req.username == "test"

    def test_register_request_invalid_role(self):
        from app.modules.auth.schemas import RegisterRequest
        with pytest.raises(Exception):
            RegisterRequest(
                username="test", password="123456",
                nickname="Test", email="test@example.com", role="superadmin"
            )

    def test_register_request_short_password(self):
        from app.modules.auth.schemas import RegisterRequest
        with pytest.raises(Exception):
            RegisterRequest(
                username="test", password="12345",
                nickname="Test", email="test@example.com", role="student"
            )


class TestConfig:
    def test_cors_origins_parsing(self):
        from app.platform.config import settings
        origins = settings.cors_origins
        assert isinstance(origins, list)
        assert len(origins) >= 1

    def test_allowed_extensions(self):
        from app.platform.config import settings
        exts = settings.allowed_extensions
        assert "pdf" in exts
        assert "docx" in exts

    def test_search_source_weights(self):
        from app.platform.config import Settings
        cfg = Settings(
            SEARCH_SOURCE_WEIGHT_CROSSREF=1.2,
            SEARCH_SOURCE_WEIGHT_GOOGLE_SCHOLAR=0.4,
        )
        weights = cfg.search_source_weights
        assert weights["Crossref API"] == 1.2
        assert weights["Google Scholar"] == 0.4


class TestRouteRegistration:
    """Verify all expected API routes are registered."""

    def setup_method(self):
        from app.main import app
        self.routes = set()
        for r in app.routes:
            if hasattr(r, "methods") and hasattr(r, "path"):
                for m in r.methods:
                    self.routes.add(f"{m} {r.path}")

    def test_auth_routes(self):
        assert "POST /auth/register" in self.routes
        assert "POST /auth/login" in self.routes
        assert "POST /auth/logout" in self.routes
        assert "GET /auth/userinfo" in self.routes
        assert "PUT /auth/profile" in self.routes
        assert "PUT /auth/password" in self.routes

    def test_session_routes(self):
        assert "POST /sessions" in self.routes
        assert "GET /sessions" in self.routes
        assert "GET /sessions/{session_id}" in self.routes
        assert "GET /sessions/{session_id}/workspace" in self.routes
        assert "DELETE /sessions/{session_id}" in self.routes

    def test_file_routes(self):
        assert "POST /files/upload" in self.routes
        assert "GET /files" in self.routes
        assert "GET /files/{file_id}" in self.routes
        assert "DELETE /files/{file_id}" in self.routes

    def test_task_routes(self):
        assert "POST /sessions/{session_id}/tasks" in self.routes
        assert "GET /sessions/{session_id}/tasks" in self.routes
        assert "GET /tasks/{task_id}" in self.routes
        assert "GET /tasks/{task_id}/stream" in self.routes
        assert "POST /tasks/{task_id}/retry" in self.routes
        assert "POST /tasks/{task_id}/sections/{section_index}/regenerate" in self.routes
        assert "GET /tasks/{task_id}/download" in self.routes

    def test_admin_routes(self):
        assert "GET /admin/users/pending" in self.routes
        assert "PUT /admin/users/{user_id}/audit" in self.routes
        assert "DELETE /admin/sessions/{session_id}" in self.routes
        assert "GET /admin/audit-logs" in self.routes

    def test_health_route(self):
        assert "GET /api/health" in self.routes


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
