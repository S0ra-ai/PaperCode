"""create llm_providers and llm_stage_configs tables

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-05-18 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'llm_providers',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False, unique=True),
        sa.Column('api_format', sa.String(30), nullable=False,
                  comment='openai_compatible | anthropic | google'),
        sa.Column('base_url', sa.String(500), nullable=False),
        sa.Column('api_key_encrypted', sa.Text, nullable=True),
        sa.Column('models_json', sa.JSON, nullable=True,
                  comment='可用模型 ID 列表'),
        sa.Column('deployment_type', sa.String(20), nullable=False,
                  server_default='cloud', comment='cloud | local'),
        sa.Column('auth_required', sa.Boolean, nullable=False,
                  server_default=sa.text('1')),
        sa.Column('is_active', sa.Boolean, nullable=False,
                  server_default=sa.text('1')),
        sa.Column('priority', sa.Integer, nullable=False,
                  server_default=sa.text('0'),
                  comment='越小优先级越高，用于 fallback 排序'),
        sa.Column('health_status', sa.String(20), nullable=False,
                  server_default='unknown',
                  comment='healthy | unhealthy | unknown'),
        sa.Column('health_checked_at', sa.DateTime, nullable=True),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime, server_default=sa.func.now(),
                  onupdate=sa.func.now()),
    )

    op.create_table(
        'llm_stage_configs',
        sa.Column('id', sa.String(64), primary_key=True),
        sa.Column('stage', sa.String(50), nullable=False,
                  comment='clarification|planning|writing|review|search|code_analysis'),
        sa.Column('provider_id', sa.String(64),
                  sa.ForeignKey('llm_providers.id', ondelete='CASCADE'),
                  nullable=False),
        sa.Column('model', sa.String(200), nullable=False),
        sa.Column('is_fallback', sa.Boolean, nullable=False,
                  server_default=sa.text('0')),
        sa.Column('priority', sa.Integer, nullable=False,
                  server_default=sa.text('0')),
        sa.Column('created_at', sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('llm_stage_configs')
    op.drop_table('llm_providers')
