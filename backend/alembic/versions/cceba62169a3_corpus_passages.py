"""corpus passages

Revision ID: cceba62169a3
Revises: 2a69f766b8ae
Create Date: 2026-07-25 12:48:58.993397

"""
from typing import Sequence, Union

from alembic import op
import pgvector.sqlalchemy
import sqlalchemy as sa


revision: str = 'cceba62169a3'
down_revision: Union[str, None] = '2a69f766b8ae'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The compose image is pgvector/pgvector; the extension just needs enabling.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table('passages',
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('author', sa.String(length=100), nullable=False),
    sa.Column('work', sa.String(length=200), nullable=False),
    sa.Column('reference', sa.String(length=100), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('translator', sa.String(length=200), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('curated', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=1024), nullable=True),
    sa.Column('original_text', sa.Text(), nullable=True),
    sa.Column('original_language', sa.String(length=10), nullable=True),
    sa.Column('original_source', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('reference')
    )
    op.create_index('ix_passages_work_position', 'passages', ['work', 'position'])


def downgrade() -> None:
    op.drop_table('passages')
