"""LLM usage accounting: one row per Claude call (MONETIZATION.md slice 1).

Revision ID: 0010
Revises: 0009
Create Date: 2026-07-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "llm_usage",
        sa.Column(
            "id",
            sa.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("model", sa.String(100), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column(
            "cache_creation_input_tokens",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "cache_read_input_tokens",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_llm_usage_user_id",
            ondelete="SET NULL",
        ),
    )
    # Slice 2's monthly cap check queries by (user, kind, month); the admin
    # summary groups over the same columns.
    op.create_index(
        "ix_llm_usage_user_kind_created_at",
        "llm_usage",
        ["user_id", "kind", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_llm_usage_user_kind_created_at", table_name="llm_usage")
    op.drop_table("llm_usage")
