"""Anchor conversations to journal entries (entry threads).

A conversation with note_id set is the reflection thread under that journal
entry; deleting the entry deletes its thread.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-19

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("note_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_conversations_note_id",
        "conversations",
        "notes",
        ["note_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_conversations_note_id", "conversations", ["note_id"])


def downgrade() -> None:
    op.drop_index("ix_conversations_note_id", table_name="conversations")
    op.drop_constraint("fk_conversations_note_id", "conversations", type_="foreignkey")
    op.drop_column("conversations", "note_id")
