"""Passage reads: per-user, per-day reading history for the calendar view.

Revision ID: 0006
Revises: 0005
Create Date: 2026-07-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "passage_reads",
        sa.Column("user_id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("passage_id", sa.Integer(), primary_key=True),
        sa.Column("read_on", sa.Date(), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_passage_reads_user_id",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["passage_id"],
            ["passages.id"],
            name="fk_passage_reads_passage_id",
            ondelete="CASCADE",
        ),
    )
    # The calendar queries by (user, day).
    op.create_index(
        "ix_passage_reads_user_read_on", "passage_reads", ["user_id", "read_on"]
    )


def downgrade() -> None:
    op.drop_index("ix_passage_reads_user_read_on", table_name="passage_reads")
    op.drop_table("passage_reads")
