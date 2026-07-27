"""The practice intention: the user's standing commitment — a daily target
in minutes and, optionally, a preferred time of day. One row per user,
upserted in place. The practice calendar itself has no table: it is a view
assembled from daily_passages, journal_entries, notes, and passage_reads.
"""
import uuid
from datetime import datetime, time

from sqlalchemy import DateTime, ForeignKey, Integer, Time, func
from sqlalchemy.dialects.postgresql import UUID
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
