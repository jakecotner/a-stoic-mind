"""notes.embedding: entry↔passage cross-links (slice 4).

Revision ID: 0017
Revises: 0016
Create Date: 2026-07-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIM = 1024  # voyage-3.5, as in models.py


def upgrade() -> None:
    op.add_column(
        "notes", sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("notes", "embedding")
