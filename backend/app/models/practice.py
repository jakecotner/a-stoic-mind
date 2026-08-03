"""The practice intention and the practice session.

The intention is the user's standing commitment — a daily target in minutes
and, optionally, a preferred time of day. One row per user, upserted in
place. The session is one sitting against that commitment: started when the
user begins, ended when they finish, with the guide they followed (if any)
and which of its steps they completed. The practice calendar itself has no
table: it is a view assembled from daily_passages, journal_entries, notes,
passage_reads, and practice_sessions.
"""
import uuid
from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Time, func
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PracticeIntention(Base):
    __tablename__ = "practice_intentions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
    )
    minutes_per_day: Mapped[int] = mapped_column(Integer)
    # Optional: "I practice at 6:30am". Local wall-clock time, no timezone.
    time_of_day: Mapped[time | None] = mapped_column(Time, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PracticeSession(Base):
    __tablename__ = "practice_sessions"
    # The calendar asks "this user's sessions in this month/on this day".
    __table_args__ = (Index("ix_practice_sessions_user_date", "user_id", "date"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    # Calendar day, stamped by the backend with the same local-date clock the
    # daily passage and journal use, so the practice calendar lines up.
    date: Mapped[date] = mapped_column(Date)
    # Which guide the sitting followed ("morning", "evening"); NULL = freeform.
    # A plain string, not an enum: guides are content, and old sessions must
    # keep their label even if a guide is later renamed or retired.
    guide: Mapped[str | None] = mapped_column(String(40), nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # NULL while the sitting is open. A session the user never ends stays
    # open forever and counts for nothing — only ended sessions appear on
    # the calendar.
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Server-computed at end (ended_at - started_at, clamped); stored rather
    # than derived so the clamp is applied once and queries stay simple.
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Step keys from the guide the user actually did (e.g. "passage",
    # "intention"); empty for freeform sittings.
    steps_completed: Mapped[list[str]] = mapped_column(
        ARRAY(String(40)), server_default="{}"
    )
