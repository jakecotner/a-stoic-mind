"""users.tier: free/plus flag for cap enforcement (MONETIZATION.md slice 2).

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("tier", sa.String(10), nullable=False, server_default="free"),
    )


def downgrade() -> None:
    op.drop_column("users", "tier")
