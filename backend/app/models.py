import uuid
from datetime import date, datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

EMBEDDING_DIM = 1024  # voyage-3.5


class Base(DeclarativeBase):
    pass


class Passage(Base):
    __tablename__ = "passages"

    id: Mapped[int] = mapped_column(primary_key=True)
    author: Mapped[str] = mapped_column(String(100))
    work: Mapped[str] = mapped_column(String(200))
    # Human-citable locator, e.g. "Enchiridion 5" or "Meditations 5.20"
    reference: Mapped[str] = mapped_column(String(100), unique=True)
    translator: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(EMBEDDING_DIM), nullable=True)


class PassageAudio(Base):
    """Synthesized narration of a passage, cached forever after first listen.

    The corpus is immutable, so each (passage, voice) pair is synthesized at
    most once; voice is part of the key so a future re-voicing doesn't require
    dropping existing audio."""

    __tablename__ = "passage_audio"

    passage_id: Mapped[int] = mapped_column(
        ForeignKey("passages.id", ondelete="CASCADE"), primary_key=True
    )
    voice: Mapped[str] = mapped_column(String(50), primary_key=True)
    media_type: Mapped[str] = mapped_column(String(50))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class User(Base):
    """Satisfies the fastapi-users user protocol (see app/auth.py)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(1024))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)


class Note(Base):
    """One model for both journal entries and margin notes: a note with a
    passage_id is a margin note on that passage; without one it's a freeform
    journal entry."""

    __tablename__ = "notes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    passage_id: Mapped[int | None] = mapped_column(
        ForeignKey("passages.id", ondelete="SET NULL"), nullable=True
    )
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    passage: Mapped[Passage | None] = relationship()


class PassageRead(Base):
    """A passage a signed-in user read on a given day (the calendar view's
    reading history). read_on is the CLIENT-local date, sent by the client so
    the server never has to reason about timezones for reads. The composite
    key makes re-reading the same passage the same day a no-op."""

    __tablename__ = "passage_reads"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    passage_id: Mapped[int] = mapped_column(
        ForeignKey("passages.id", ondelete="CASCADE"), primary_key=True
    )
    read_on: Mapped[date] = mapped_column(Date, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    # NULL = anonymous conversation (chat while logged out is still allowed).
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Set = this conversation is the reflection thread under that journal
    # entry; the entry's deletion cascades to it.
    note_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", order_by="Message.created_at"
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE")
    )
    role: Mapped[str] = mapped_column(String(20))  # "user" | "assistant"
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
