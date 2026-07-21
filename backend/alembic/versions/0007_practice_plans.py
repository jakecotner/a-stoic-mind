"""Practice plans: one per user — committed daily practice time and duration.

Revision ID: 0007
Revises: 0006
Create Date: 2026-07-20

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "practice_plans",
        sa.Column("user_id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("reminder_time", sa.String(length=5), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_practice_plans_user_id",
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("practice_plans")
