"""users: Stripe customer link + mirrored subscription state (slice 3).

Revision ID: 0014
Revises: 0013
Create Date: 2026-07-22

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("stripe_customer_id", sa.String(255), nullable=True)
    )
    op.create_unique_constraint(
        "uq_users_stripe_customer_id", "users", ["stripe_customer_id"]
    )
    op.add_column(
        "users",
        sa.Column("plus_renews_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "plus_cancel_at_period_end",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "plus_cancel_at_period_end")
    op.drop_column("users", "plus_renews_at")
    op.drop_constraint("uq_users_stripe_customer_id", "users")
    op.drop_column("users", "stripe_customer_id")
