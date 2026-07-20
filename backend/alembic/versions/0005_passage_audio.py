"""Passage audio cache: synthesized narration, one row per (passage, voice).

Revision ID: 0005
Revises: 0004
Create Date: 2026-07-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "passage_audio",
        sa.Column("passage_id", sa.Integer(), primary_key=True),
        sa.Column("voice", sa.String(length=50), primary_key=True),
        sa.Column("media_type", sa.String(length=50), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["passage_id"],
            ["passages.id"],
            name="fk_passage_audio_passage_id",
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("passage_audio")
