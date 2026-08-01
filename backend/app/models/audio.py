"""Cached narration audio for the corpus and its breakdowns.

Narration is synthesized by the OpenAI speech API on first listen and kept
forever — the corpus is immutable and breakdowns are cached forever, so a
recording never goes stale. voice is part of each key: a listener choosing
a different voice triggers one extra synthesis, never a re-recording.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    LargeBinary,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PassageAudio(Base):
    __tablename__ = "passage_audio"

    passage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("passages.id", ondelete="CASCADE"),
        primary_key=True,
    )
    voice: Mapped[str] = mapped_column(String(50), primary_key=True)
    media_type: Mapped[str] = mapped_column(String(50))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class BreakdownAudio(Base):
    """Narration of a passage's breakdown. The composite FK follows
    passage_breakdowns, so a future quality pass that deletes a breakdown to
    force regeneration drops its recordings with it."""

    __tablename__ = "breakdown_audio"
    __table_args__ = (
        ForeignKeyConstraint(
            ["passage_id", "language"],
            ["passage_breakdowns.passage_id", "passage_breakdowns.language"],
            ondelete="CASCADE",
        ),
    )

    passage_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    language: Mapped[str] = mapped_column(String(10), primary_key=True)
    voice: Mapped[str] = mapped_column(String(50), primary_key=True)
    media_type: Mapped[str] = mapped_column(String(50))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
