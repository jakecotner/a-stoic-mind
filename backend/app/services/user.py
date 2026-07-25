"""Account-level business logic."""
from sqlalchemy.orm import Session

from app.crud import conversation as conversation_crud
from app.crud import user as user_crud
from app.models import User


def delete_account(db: Session, user: User) -> None:
    """Self-service account deletion (required by App Store guideline
    5.1.1(v) if a mobile app ever ships, and good practice regardless).

    Conversations are deleted explicitly first: their user_id FK is SET NULL,
    which would otherwise leave the user's chat history orphaned but intact.
    One commit covers both deletes.

    Orgs module: organizations OWNED by this user are deleted by the
    database (owner_id FK is ON DELETE CASCADE), taking their memberships
    and invites with them; memberships this user held in others' orgs
    cascade too. That owned-orgs-die-with-the-owner behavior is a product
    decision recorded in MODULES.md."""
    conversation_crud.delete_all_for_user(db, user.id)
    row = user_crud.get(db, user.id)
    if row is not None:
        db.delete(row)
    db.commit()
