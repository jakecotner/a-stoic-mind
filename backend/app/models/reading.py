"""The reader's traces: margin notes and reading history.

A Note lives in a passage's margin — it reappears whenever that passage is
reopened — and also carries a day stamp so the practice calendar can show
the notes taken on a given day. passage_id is SET NULL (not CASCADE): the
note is the user's writing and outlives any corpus reshuffle; the calendar
still shows it by day.

A PassageRead records "this user read this passage on this day", written by
the deliberate mark-as-read action at the end of a chapter. Rereading on a
later day is a new row; the same day is deduped by the unique constraint.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Note(Base):
    __tablename__ = "notes"
    __table_args__ = (
        # The calendar asks "this user's notes on this day"; the reader asks
        # "this user's notes on these passages".
        Index("ix_notes_user_date", "user_id", "date"),
        Index("ix_notes_user_passage", "user_id", "passage_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
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


class PassageRead(Base):
    __tablename__ = "passage_reads"
    __table_args__ = (
        UniqueConstraint("user_id", "passage_id", "date"),
        Index("ix_passage_reads_user_date", "user_id", "date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    passage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("passages.id", ondelete="CASCADE"),
        index=True,
    )
    date: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
