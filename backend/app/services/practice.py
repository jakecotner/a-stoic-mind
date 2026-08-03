"""Practice business logic: assemble the month view and the day detail from
the traces the other slices record, manage the intention, and run sessions
(start, end, and the guides that structure them)."""
import calendar as calendar_mod
import uuid
from datetime import date, datetime, time, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import journal as journal_crud
from app.crud import practice as practice_crud
from app.models import User
from app.schemas.journal import JournalEntryOut
from app.schemas.passage import PassageOut
from app.schemas.practice import (
    CalendarDayOut,
    DayDetailOut,
    GuideOut,
    GuideStepOut,
    IntentionOut,
    NoteWithPassageOut,
    ReadWorkOut,
    SessionOut,
)
from app.services import daily as daily_service

# A session left open (never ended) records nothing; one ended after a very
# long gap is clamped so a forgotten tab doesn't record an eight-hour sit.
MAX_SESSION_SECONDS = 4 * 60 * 60

# The guides are content, not configuration — two classic Stoic exercises.
# Step keys are what clients report back in steps_completed.
GUIDES: list[GuideOut] = [
    GuideOut(
        key="morning",
        title="Morning preparation",
        tagline="Meet the day before it meets you.",
        steps=[
            GuideStepOut(
                key="passage",
                kind="passage",
                title="Today's passage",
                body="Listen or read slowly. Let one line stay with you.",
            ),
            GuideStepOut(
                key="rehearse",
                kind="prompt",
                title="Rehearse the day",
                body=(
                    "Look ahead at what is coming today. What could test your "
                    "patience, your temper, your honesty? Name it, and decide "
                    "now how the best version of you meets it."
                ),
            ),
            GuideStepOut(
                key="intention",
                kind="prompt",
                title="Set your intention",
                body=(
                    "In one or two sentences: what is the one thing you will "
                    "practice today?"
                ),
            ),
        ],
    ),
    GuideOut(
        key="evening",
        title="Evening review",
        tagline="Seneca's nightly self-examination.",
        steps=[
            GuideStepOut(
                key="badly",
                kind="prompt",
                title="What did I do badly?",
                body=(
                    "Where did you fall short of your own standard today? Name "
                    "it without excuses — and without cruelty. The point is to "
                    "see clearly, not to punish."
                ),
            ),
            GuideStepOut(
                key="well",
                kind="prompt",
                title="What did I do well?",
                body=(
                    "Where did you act as you intended? Give yourself an honest "
                    "account of it; progress counted is progress kept."
                ),
            ),
            GuideStepOut(
                key="undone",
                kind="prompt",
                title="What did I leave undone?",
                body=(
                    "What did you avoid or postpone that mattered? What will "
                    "you do about it tomorrow?"
                ),
            ),
            GuideStepOut(
                key="passage",
                kind="passage",
                title="Close with today's passage",
                body="End with the day's words. Let them settle before sleep.",
            ),
        ],
    ),
]


def list_guides() -> list[GuideOut]:
    return GUIDES


def start_session(db: Session, user: User, guide: str | None) -> SessionOut:
    row = practice_crud.create_session(db, user.id, date.today(), guide)
    return SessionOut.model_validate(row)


def end_session(
    db: Session, user: User, session_id: uuid.UUID, steps_completed: list[str]
) -> SessionOut:
    row = practice_crud.get_session(db, user.id, session_id)
    if row is None:
        raise HTTPException(404, "Session not found")
    if row.ended_at is None:
        now = datetime.now(timezone.utc)
        elapsed = int((now - row.started_at).total_seconds())
        row.ended_at = now
        row.duration_seconds = max(0, min(elapsed, MAX_SESSION_SECONDS))
        row.steps_completed = steps_completed
        db.commit()
        db.refresh(row)
    # Already ended: return as-is — a double tap on "End" shouldn't error.
    return SessionOut.model_validate(row)


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
    sessions = practice_crud.session_aggregates(db, user.id, start, end)

    return [
        CalendarDayOut(
            date=d,
            daily_reference=daily.get(d),
            journal_count=journal.get(d, 0),
            note_count=notes.get(d, 0),
            read_count=reads.get(d, 0),
            session_count=sessions.get(d, (0, 0))[0],
            practice_seconds=sessions.get(d, (0, 0))[1],
        )
        for d in (date(year, month, n) for n in range(1, days_in_month + 1))
    ]


def day_detail(db: Session, user: User, on: date) -> DayDetailOut:
    if not 2000 <= on.year <= 2100:
        raise HTTPException(422, "Invalid date")
    # Any date can be viewed; its passage is assigned on first request and
    # permanent from then on, so future days show what the landing page will.
    daily_row = daily_service.get_or_assign(db, on)
    return DayDetailOut(
        date=on,
        daily=PassageOut.model_validate(daily_row.passage),
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
        sessions=[
            SessionOut.model_validate(row)
            for row in practice_crud.sessions_on(db, user.id, on)
        ],
    )
