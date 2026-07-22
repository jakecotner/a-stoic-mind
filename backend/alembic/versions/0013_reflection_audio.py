"""Reflection audio cache: narration of a passage's Stoa breakdown, keyed to
the hash of the reflection text it was synthesized from.

Revision ID: 0013
Revises: 0012
Create Date: 2026-07-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reflection_audio",
        sa.Column("passage_id", sa.Integer(), primary_key=True),
        sa.Column("language", sa.String(length=35), primary_key=True),
        sa.Column("voice", sa.String(length=50), primary_key=True),
        sa.Column("text_hash", sa.String(length=64), nullable=False),
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
            name="fk_reflection_audio_passage_id",
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("reflection_audio")
