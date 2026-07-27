"""DB access for the practice surface: the intention row and the per-day
aggregates the calendar is assembled from."""
import uuid
from datetime import date

from sqlalchemy import Row, func, select
from sqlalchemy.orm import Session

from app.models import (
    DailyPassage,
    JournalEntry,
    Note,
    Passage,
    PassageRead,
    PracticeIntention,
)


def get_intention(db: Session, user_id: uuid.UUID) -> PracticeIntention | None:
    return db.scalar(
        select(PracticeIntention).where(PracticeIntention.user_id == user_id)
    )


def upsert_intention(
    db: Session, user_id: uuid.UUID, minutes_per_day: int, time_of_day
) -> PracticeIntention:
    row = get_intention(db, user_id)
    if row is None:
        row = PracticeIntention(user_id=user_id)
        db.add(row)
    row.minutes_per_day = minutes_per_day
    row.time_of_day = time_of_day
    db.commit()
    db.refresh(row)
    return row


def daily_references(db: Session, start: date, end: date) -> dict[date, str]:
    """date -> daily passage reference, for [start, end)."""
    rows = db.execute(
        select(DailyPassage.date, Passage.reference)
        .join(Passage, Passage.id == DailyPassage.passage_id)
        .where(DailyPassage.date >= start, DailyPassage.date < end)
    )
    return {d: ref for d, ref in rows}


def _counts_by_date(db: Session, model, user_id: uuid.UUID, start: date, end: date):
    rows = db.execute(
        select(model.date, func.count())
        .where(model.user_id == user_id, model.date >= start, model.date < end)
        .group_by(model.date)
    )
    return {d: n for d, n in rows}


def journal_counts(db, user_id, start, end) -> dict[date, int]:
    return _counts_by_date(db, JournalEntry, user_id, start, end)


def note_counts(db, user_id, start, end) -> dict[date, int]:
    return _counts_by_date(db, Note, user_id, start, end)


def read_counts(db, user_id, start, end) -> dict[date, int]:
    return _counts_by_date(db, PassageRead, user_id, start, end)


def notes_on(db: Session, user_id: uuid.UUID, on: date) -> list[Row]:
    """The day's notes with the reference of the passage each lives on."""
    return list(
        db.execute(
            select(Note.id, Note.content, Passage.reference.label("passage_reference"))
            .join(Passage, Passage.id == Note.passage_id, isouter=True)
            .where(Note.user_id == user_id, Note.date == on)
            .order_by(Note.created_at)
        )
    )


def reads_on(db: Session, user_id: uuid.UUID, on: date) -> list[Row]:
    """The day's reading grouped by work: (work, author, passage_count)."""
    return list(
        db.execute(
            select(Passage.work, Passage.author, func.count().label("passage_count"))
            .join(PassageRead, PassageRead.passage_id == Passage.id)
            .where(PassageRead.user_id == user_id, PassageRead.date == on)
            .group_by(Passage.work, Passage.author)
            .order_by(Passage.author, Passage.work)
        )
    )
