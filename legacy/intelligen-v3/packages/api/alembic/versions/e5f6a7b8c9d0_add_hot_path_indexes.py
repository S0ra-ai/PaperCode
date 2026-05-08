"""Add indexes on hot-path columns (session lookup, task status)

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2025-01-09

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade():
    # sessions: frequently filtered by userId, ordered by updatedAt
    try:
        op.create_index("ix_sessions_userId", "sessions", ["userId"])
    except Exception:
        pass
    try:
        op.create_index("ix_sessions_user_updated", "sessions", ["userId", "updatedAt"])
    except Exception:
        pass

    # generate_tasks: frequent lookups by sessionId and status
    try:
        op.create_index("ix_generate_tasks_sessionId", "generate_tasks", ["sessionId"])
    except Exception:
        pass
    try:
        op.create_index("ix_generate_tasks_status", "generate_tasks", ["status"])
    except Exception:
        pass
    try:
        op.create_index(
            "ix_generate_tasks_session_created", "generate_tasks",
            ["sessionId", "createdAt"],
        )
    except Exception:
        pass
    try:
        op.create_index(
            "ix_generate_tasks_status_created", "generate_tasks",
            ["status", "createdAt"],
        )
    except Exception:
        pass


def downgrade():
    for name in (
        "ix_generate_tasks_status_created",
        "ix_generate_tasks_session_created",
        "ix_generate_tasks_status",
        "ix_generate_tasks_sessionId",
        "ix_sessions_user_updated",
        "ix_sessions_userId",
    ):
        try:
            op.drop_index(name, table_name=None)
        except Exception:
            pass
