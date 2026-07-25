"""The corpus: public-domain Stoic texts, chunked into citable passages.

Shared library content — owned by no user, immutable once ingested.
Imported from the first-generation stoa project's database; the ingestion
scripts live in scripts/ingest/ for provenance and re-runs.
"""
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    false,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

# Empty until a retrieval feature pays to embed the corpus; dimension matches
# Voyage voyage-3.5, which the first-generation project had wired up.
EMBEDDING_DIM = 1024


class Passage(Base):
    __tablename__ = "passages"
    __table_args__ = (Index("ix_passages_work_position", "work", "position"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    author: Mapped[str] = mapped_column(String(100))
    work: Mapped[str] = mapped_column(String(200))
    # Human-citable locator, e.g. "Enchiridion 5" or "Meditations 5.20";
    # unique corpus-wide (the work name is part of the reference).
    reference: Mapped[str] = mapped_column(String(100), unique=True)
    # Reading order within the work — references sort lexically wrong
    # ("Enchiridion 10" < "Enchiridion 2"), so order by this instead.
    position: Mapped[int] = mapped_column(Integer)
    translator: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    # In the daily-passage pool (curated high-impact passages).
    curated: Mapped[bool] = mapped_column(Boolean, server_default=false())
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(EMBEDDING_DIM), nullable=True
    )
    # The passage in its original ancient language where ingested ("grc" or
    # "la"). Translations are made from this when present, with the English
    # as a reference. original_source credits the edition — a CC BY-SA
    # attribution requirement for Perseus texts.
    original_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    original_source: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
