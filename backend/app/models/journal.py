"""Journal entries: freeform writing, owned by the user.

An entry belongs to a calendar day (`date`, stamped by the backend with the
same local-date clock the daily passage uses, so the practice calendar lines
up), and optionally points at the passage that prompted it. Margin notes on
specific passages are a separate concept (slice 4) — an entry is a page of
the day, a note lives in a passage's margin.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    # The pad and the calendar both ask "this user's entries on this day".
    __table_args__ = (Index("ix_journal_entries_user_date", "user_id", "date"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    # The passage that prompted the entry (usually the day's). SET NULL: the
    # entry is the user's writing and outlives any corpus reshuffle.
    passage_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("passages.id", ondelete="SET NULL"),
        nullable=True,
    )
    date: Mapped[date] = mapped_column(Date)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
