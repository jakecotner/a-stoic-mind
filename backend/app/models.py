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
    # The passage in its original ancient language, where ingested ("grc" or
    # "la"); translations are made from this when present, with the English
    # as a reference. original_source credits the edition (a CC BY-SA
    # attribution requirement for Perseus texts).
    original_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    original_source: Mapped[str | None] = mapped_column(String(200), nullable=True)


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


class ReflectionAudio(Base):
    """Narration of a passage's Stoa breakdown. Unlike PassageAudio the source
    text is not immutable — reflections live in an in-process cache and are
    regenerated after a restart — so the row remembers the hash of the text it
    was synthesized from and is replaced when the current reflection differs."""

    __tablename__ = "reflection_audio"

    passage_id: Mapped[int] = mapped_column(
        ForeignKey("passages.id", ondelete="CASCADE"), primary_key=True
    )
    # Reflection language as in app/translation.py; "" = English.
    language: Mapped[str] = mapped_column(String(35), primary_key=True)
    voice: Mapped[str] = mapped_column(String(50), primary_key=True)
    text_hash: Mapped[str] = mapped_column(String(64))
    media_type: Mapped[str] = mapped_column(String(50))
    data: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PassageTranslation(Base):
    """LLM translation of a passage into a target language, generated on first
    request and cached forever (the corpus is immutable, like PassageAudio).

    Currently translated FROM the ingested public-domain English; when the
    original-language texts are ingested the prompt will translate from the
    original with the English as a reference. model records which LLM produced
    the text so a re-translation pass can target stale rows."""

    __tablename__ = "passage_translations"

    passage_id: Mapped[int] = mapped_column(
        ForeignKey("passages.id", ondelete="CASCADE"), primary_key=True
    )
    # BCP-47-style code from the supported list in app/translation.py,
    # e.g. "es", "zh-Hans".
    language: Mapped[str] = mapped_column(String(35), primary_key=True)
    text: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(100))
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
    # "free" | "plus" — owned by Stripe webhooks (app/billing.py) since
    # slice 3; the admin endpoint remains as a manual override.
    tier: Mapped[str] = mapped_column(String(10), server_default="free")
    # Stripe linkage (MONETIZATION.md slice 3). renews/cancel mirror the
    # subscription state from webhook events so /api/billing/summary never
    # has to call Stripe.
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True
    )
    plus_renews_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    plus_cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    # Reading language: a code from app/translation.py LANGUAGES, or NULL for
    # the published English. Account-level so it follows the user across
    # devices; the web client mirrors it in localStorage for signed-out use.
    language: Mapped[str | None] = mapped_column(String(35), nullable=True)


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
    # voyage-3.5 embedding of content, for entry↔passage cross-links
    # (MONETIZATION.md slice 4). NULL when Voyage isn't configured or the
    # embed failed; written best-effort on create/update and lazily filled
    # by the related-notes lookup.
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(EMBEDDING_DIM), nullable=True
    )
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


class PracticePlan(Base):
    """One row per user: the practice they've committed to. reminder_time is
    client-local wall time ("HH:MM") — the client schedules its own local
    notification, so the server never converts it."""

    __tablename__ = "practice_plans"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    reminder_time: Mapped[str] = mapped_column(String(5))  # "HH:MM"
    duration_minutes: Mapped[int]
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
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
    # Set = this conversation is the user's discussion thread on that passage
    # in the reading pane (MONETIZATION.md slice 4; Plus-only). One per
    # (user, passage), enforced in the chat endpoint.
    passage_id: Mapped[int | None] = mapped_column(
        ForeignKey("passages.id", ondelete="CASCADE"),
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


class Synthesis(Base):
    """The Stoa's weekly synthesis of one user's journal (MONETIZATION.md
    slice 4; Plus-only). Keyed by the client-local Monday the week starts on.
    entry_count remembers how many notes the synthesis covered, so a client
    can offer a refresh when new entries have appeared; language is stored,
    not keyed — a re-request in another language regenerates in place."""

    __tablename__ = "syntheses"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    week_start: Mapped[date] = mapped_column(Date, primary_key=True)
    content: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(100))
    # Language as in app/translation.py; "" = English.
    language: Mapped[str] = mapped_column(String(35), server_default="")
    entry_count: Mapped[int]
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class LlmUsage(Base):
    """One row per LLM API call, for cost accounting (MONETIZATION.md slice 1)."""

    __tablename__ = "llm_usage"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    # NULL = not attributable to a user: shared artifacts (passage breakdowns,
    # translations) and anonymous chat.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(
        String(40)
    )  # "reflection_turn" | "passage_breakdown" | "translation"
    model: Mapped[str] = mapped_column(String(100))
    input_tokens: Mapped[int]
    output_tokens: Mapped[int]
    cache_creation_input_tokens: Mapped[int] = mapped_column(default=0)
    cache_read_input_tokens: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
