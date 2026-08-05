"""Chat threads with the Stoic mentor (optional chat module — delete
alongside services/chat.py if the product stops being conversational).

Reinstated 2026-08 (see MODULES.md): the original conversations/messages
pair from the template, plus `share_journal` — the per-conversation consent
switch for letting the mentor read the user's recent journal entries.
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, false, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


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
    # The tradition the conversation was started in (registry slug —
    # app/services/tradition.py). The mentor keeps this voice even if the
    # user later switches their home tradition.
    tradition: Mapped[str] = mapped_column(String(40), server_default="stoicism")
    # The mentor sees the user's recent journal entries in THIS conversation
    # only while this is on. Off by default — the journal is intimate, and
    # sharing it is an explicit, visible choice (anonymous conversations
    # have no journal to share).
    share_journal: Mapped[bool] = mapped_column(Boolean, server_default=false())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # passive_deletes: the DB's ON DELETE CASCADE removes messages; without
    # it SQLAlchemy nulls the (NOT NULL) child FKs first and the delete 500s.
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        order_by="Message.created_at",
        cascade="all, delete-orphan",
        passive_deletes=True,
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
