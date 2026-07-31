"""Account-level business logic."""
from sqlalchemy.orm import Session

from app.crud import user as user_crud
from app.models import User


def delete_account(db: Session, user: User) -> None:
    """Self-service account deletion (required by App Store guideline
    5.1.1(v) if a mobile app ever ships, and good practice regardless).
    The user's journal, notes, and reading history go with the row via
    DB cascade."""
    row = user_crud.get(db, user.id)
    if row is not None:
        db.delete(row)
    db.commit()
