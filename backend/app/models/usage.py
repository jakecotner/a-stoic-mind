import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LlmUsage(Base):
    """One row per LLM API call, for cost accounting."""

    __tablename__ = "llm_usage"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    # NULL = not attributable to a user (anonymous chat, shared artifacts).
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(40))  # e.g. "chat_turn"
    model: Mapped[str] = mapped_column(String(100))
    input_tokens: Mapped[int]
    output_tokens: Mapped[int]
    cache_creation_input_tokens: Mapped[int] = mapped_column(default=0)
    cache_read_input_tokens: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
