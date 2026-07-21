"""Practice tracking: reading history and the calendar view.

All endpoints require auth — the calendar is a mirror of one user's practice.
Timezone convention: clients report reads with their LOCAL date (read_on), so
those need no conversion. Note timestamps are stored UTC, so calendar
endpoints take tz_offset — minutes to ADD to UTC to get the client's local
time (JavaScript: -new Date().getTimezoneOffset()).
"""
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, joinedload

from app.auth import current_active_user
from app.db import get_db
from app.journal import _stamp_thread_ids
from app.models import Note, Passage, PassageRead, User
from app.schemas import (
    CalendarDayOut,
    CalendarMonthOut,
    DayDetailOut,
    ReadsTrackIn,
    ReadPassageRef,
)

router = APIRouter(prefix="/api", tags=["practice"])

TzOffset = Query(0, ge=-14 * 60, le=14 * 60)


@router.post("/reads", status_code=204)
def track_reads(
    body: ReadsTrackIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """Record passages as read on the client's local date. Idempotent —
    re-reading the same passage the same day is a no-op."""
    valid_ids = set(
        db.scalars(select(Passage.id).where(Passage.id.in_(body.passage_ids)))
    )
    if not valid_ids:
        return
    db.execute(
        pg_insert(PassageRead)
        .values(
            [
                {"user_id": user.id, "passage_id": pid, "read_on": body.read_on}
                for pid in valid_ids
            ]
        )
        .on_conflict_do_nothing()
    )
    db.commit()


def _local_day(dt, tz_offset: int) -> date:
    return (dt + timedelta(minutes=tz_offset)).date()


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    first = date(year, month, 1)
    next_first = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return first, next_first


@router.get("/calendar/day/{day}", response_model=DayDetailOut)
def calendar_day(
    day: date,
    tz_offset: int = TzOffset,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """Everything about one practice day: that day's daily passage, the
    passages read, and the notes written."""
    # The daily passage is deterministic (see /api/daily), so it can be
    # reconstructed for any date — as long as the corpus size is stable.
    daily = None
    count = db.scalar(select(func.count()).select_from(Passage))
    if count:
        offset = day.toordinal() % count
        daily = db.scalars(
            select(Passage).order_by(Passage.id).offset(offset).limit(1)
        ).first()

    pad = timedelta(days=1)
    candidates = list(
        db.scalars(
            select(Note)
            .options(joinedload(Note.passage))
            .where(
                Note.user_id == user.id,
                Note.created_at >= day - pad,
                Note.created_at < day + 2 * pad,
            )
            .order_by(Note.created_at.desc())
        )
    )
    notes = [n for n in candidates if _local_day(n.created_at, tz_offset) == day]
    _stamp_thread_ids(db, notes)

    passages_read = [
        ReadPassageRef.model_validate(p)
        for p in db.scalars(
            select(Passage)
            .join(PassageRead, PassageRead.passage_id == Passage.id)
            .where(PassageRead.user_id == user.id, PassageRead.read_on == day)
            .order_by(Passage.id)
        )
    ]

    return DayDetailOut(
        date=day, daily_passage=daily, notes=notes, passages_read=passages_read
    )


@router.get("/calendar/{year}/{month}", response_model=CalendarMonthOut)
def calendar_month(
    year: int,
    month: int,
    tz_offset: int = TzOffset,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """Per-day activity counts for one month. Days with no activity are
    omitted; the client renders the full grid."""
    if not 1 <= month <= 12 or not 2020 <= year <= 2100:
        raise HTTPException(422, "Invalid month")
    first, next_first = _month_bounds(year, month)

    days: dict[date, CalendarDayOut] = {}

    def day_out(d: date) -> CalendarDayOut:
        return days.setdefault(
            d, CalendarDayOut(date=d, entries=0, passages_read=0)
        )

    # Notes: fetch a day beyond each edge (UTC timestamps), bucket locally.
    pad = timedelta(days=1)
    note_times = db.scalars(
        select(Note.created_at).where(
            Note.user_id == user.id,
            Note.created_at >= first - pad,
            Note.created_at < next_first + pad,
        )
    ).all()
    for ts in note_times:
        d = _local_day(ts, tz_offset)
        if first <= d < next_first:
            day_out(d).entries += 1

    read_rows = db.execute(
        select(PassageRead.read_on, func.count())
        .where(
            PassageRead.user_id == user.id,
            PassageRead.read_on >= first,
            PassageRead.read_on < next_first,
        )
        .group_by(PassageRead.read_on)
    ).all()
    for read_on, count in read_rows:
        day_out(read_on).passages_read = count

    return CalendarMonthOut(
        year=year, month=month, days=sorted(days.values(), key=lambda d: d.date)
    )
