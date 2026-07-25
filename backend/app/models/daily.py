"""The daily passage: one curated passage assigned to each calendar date,
global — every visitor sees the same passage on the same day.

Rows are created lazily by the first request of a new day
(services/daily.py), drawn from the curated pool (passages.curated) with no
repeats until the pool is exhausted.
"""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.passage import Passage


class DailyPassage(Base):
    __tablename__ = "daily_passages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    # The unique constraint is also the race guard: concurrent first visitors
    # of a new day both try to insert; one wins, the other refetches.
    date: Mapped[date] = mapped_column(Date, unique=True)
    passage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("passages.id", ondelete="CASCADE"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    passage: Mapped[Passage] = relationship()
