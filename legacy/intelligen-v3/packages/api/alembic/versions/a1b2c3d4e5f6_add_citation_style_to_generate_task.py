"""add citation_style to generate_task

Revision ID: a1b2c3d4e5f6
Revises: 99b5265ba06d
Create Date: 2026-05-15 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '99b5265ba06d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'generate_tasks',
        sa.Column('citationStyle', sa.String(length=20), nullable=True, server_default='gb'),
    )


def downgrade() -> None:
    op.drop_column('generate_tasks', 'citationStyle')
