"""Passage translation cache: LLM translation, one row per (passage, language).

Revision ID: 0008
Revises: 0007
Create Date: 2026-07-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "passage_translations",
        sa.Column("passage_id", sa.Integer(), primary_key=True),
        sa.Column("language", sa.String(length=35), primary_key=True),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["passage_id"],
            ["passages.id"],
            name="fk_passage_translations_passage_id",
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("passage_translations")
