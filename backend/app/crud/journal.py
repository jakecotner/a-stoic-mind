"""DB access for journal entries."""
import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import JournalEntry


def create(
    db: Session,
    user_id: uuid.UUID,
    content: str,
    passage_id: uuid.UUID | None,
    entry_date: date,
) -> JournalEntry:
    entry = JournalEntry(
        user_id=user_id, content=content, passage_id=passage_id, date=entry_date
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get(db: Session, entry_id: uuid.UUID) -> JournalEntry | None:
    return db.get(JournalEntry, entry_id)


def for_user_on(db: Session, user_id: uuid.UUID, on: date) -> list[JournalEntry]:
    return list(
        db.scalars(
            select(JournalEntry)
            .where(JournalEntry.user_id == user_id, JournalEntry.date == on)
            .order_by(JournalEntry.created_at)
        )
    )


def recent_for_user(
    db: Session, user_id: uuid.UUID, limit: int
) -> list[JournalEntry]:
    """The newest `limit` entries across all days, returned oldest-first
    (chat context reads chronologically)."""
    return list(
        db.scalars(
            select(JournalEntry)
            .where(JournalEntry.user_id == user_id)
            .order_by(JournalEntry.created_at.desc())
            .limit(limit)
        )
    )[::-1]


def count_for_user(db: Session, user_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(JournalEntry)
            .where(JournalEntry.user_id == user_id)
        )
        or 0
    )


def distinct_dates_desc(db: Session, user_id: uuid.UUID) -> list[date]:
    """Every date the user wrote at least one entry, newest first."""
    return list(
        db.scalars(
            select(JournalEntry.date)
            .where(JournalEntry.user_id == user_id)
            .distinct()
            .order_by(JournalEntry.date.desc())
        )
    )


def update(db: Session, entry: JournalEntry, content: str) -> JournalEntry:
    entry.content = content
    db.commit()
    db.refresh(entry)
    return entry


def set_reflection(
    db: Session, entry: JournalEntry, text: str, model: str
) -> JournalEntry:
    entry.reflection = text
    entry.reflection_model = model
    db.commit()
    db.refresh(entry)
    return entry


def delete(db: Session, entry: JournalEntry) -> None:
    db.delete(entry)
    db.commit()
