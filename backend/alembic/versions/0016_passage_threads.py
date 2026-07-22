"""conversations.passage_id: reading-pane discussion threads (slice 4).

Revision ID: 0016
Revises: 0015
Create Date: 2026-07-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column(
            "passage_id",
            sa.Integer(),
            sa.ForeignKey(
                "passages.id",
                ondelete="CASCADE",
                name="fk_conversations_passage_id",
            ),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_conversations_passage_id", "conversations", ["passage_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_conversations_passage_id", "conversations")
    op.drop_column("conversations", "passage_id")
