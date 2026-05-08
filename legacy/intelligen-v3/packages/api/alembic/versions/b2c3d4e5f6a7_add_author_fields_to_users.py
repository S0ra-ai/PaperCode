"""add author fields to users

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-18 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('realName', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('institution', sa.String(200), nullable=True))
    op.add_column('users', sa.Column('department', sa.String(200), nullable=True))
    op.add_column('users', sa.Column('studentId', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('orcid', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('researchArea', sa.String(500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'researchArea')
    op.drop_column('users', 'orcid')
    op.drop_column('users', 'studentId')
    op.drop_column('users', 'department')
    op.drop_column('users', 'institution')
    op.drop_column('users', 'realName')
