"""Original-language text on passages: original_text/language/source.

Revision ID: 0009
Revises: 0008
Create Date: 2026-07-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("passages", sa.Column("original_text", sa.Text(), nullable=True))
    op.add_column(
        "passages", sa.Column("original_language", sa.String(length=10), nullable=True)
    )
    op.add_column(
        "passages", sa.Column("original_source", sa.String(length=200), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("passages", "original_source")
    op.drop_column("passages", "original_language")
    op.drop_column("passages", "original_text")
