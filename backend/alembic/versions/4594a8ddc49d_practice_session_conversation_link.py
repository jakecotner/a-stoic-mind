"""practice session conversation link

Revision ID: 4594a8ddc49d
Revises: 388b812a363f
Create Date: 2026-08-04 21:31:27.427106

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4594a8ddc49d'
down_revision: Union[str, None] = '388b812a363f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('practice_sessions', sa.Column('conversation_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_practice_sessions_conversation_id',
        'practice_sessions', 'conversations',
        ['conversation_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_practice_sessions_conversation_id', 'practice_sessions', type_='foreignkey'
    )
    op.drop_column('practice_sessions', 'conversation_id')
