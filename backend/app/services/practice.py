"""Practice business logic: assemble the month view and the day detail from
the traces the other slices record, and manage the intention."""
import calendar as calendar_mod
from datetime import date, time

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import daily as daily_crud
from app.crud import journal as journal_crud
from app.crud import practice as practice_crud
from app.models import User
from app.schemas.journal import JournalEntryOut
from app.schemas.passage import PassageOut
from app.schemas.practice import (
    CalendarDayOut,
    DayDetailOut,
    IntentionOut,
    NoteWithPassageOut,
    ReadWorkOut,
)


def get_intention(db: Session, user: User) -> IntentionOut | None:
    row = practice_crud.get_intention(db, user.id)
    return IntentionOut.model_validate(row) if row is not None else None


def set_intention(
    db: Session, user: User, minutes_per_day: int, time_of_day: time | None
) -> IntentionOut:
    row = practice_crud.upsert_intention(db, user.id, minutes_per_day, time_of_day)
    return IntentionOut.model_validate(row)


def month_view(db: Session, user: User, year: int, month: int) -> list[CalendarDayOut]:
    if not 1 <= month <= 12 or not 2000 <= year <= 2100:
        raise HTTPException(422, "Invalid year or month")
    start = date(year, month, 1)
    days_in_month = calendar_mod.monthrange(year, month)[1]
    end = (
        date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    )

    daily = practice_crud.daily_references(db, start, end)
    journal = practice_crud.journal_counts(db, user.id, start, end)
    notes = practice_crud.note_counts(db, user.id, start, end)
    reads = practice_crud.read_counts(db, user.id, start, end)

    return [
        CalendarDayOut(
            date=d,
            daily_reference=daily.get(d),
            journal_count=journal.get(d, 0),
            note_count=notes.get(d, 0),
            read_count=reads.get(d, 0),
        )
        for d in (date(year, month, n) for n in range(1, days_in_month + 1))
    ]


def day_detail(db: Session, user: User, on: date) -> DayDetailOut:
    daily_row = daily_crud.get_by_date(db, on)
    return DayDetailOut(
        date=on,
        daily=(
            PassageOut.model_validate(daily_row.passage)
            if daily_row is not None
            else None
        ),
        journal=[
            JournalEntryOut.model_validate(e)
            for e in journal_crud.for_user_on(db, user.id, on)
        ],
        notes=[
            NoteWithPassageOut.model_validate(row, from_attributes=True)
            for row in practice_crud.notes_on(db, user.id, on)
        ],
        reads=[
            ReadWorkOut.model_validate(row, from_attributes=True)
            for row in practice_crud.reads_on(db, user.id, on)
        ],
    )
