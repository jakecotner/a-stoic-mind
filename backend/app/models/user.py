import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.oauth import OAuthAccount


class User(Base):
    """Satisfies the fastapi-users user protocol (see app/core/auth.py)."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(1024))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # "free" | "plus" — owned by Stripe webhooks (app/services/billing.py);
    # the admin endpoint remains as a manual override.
    tier: Mapped[str] = mapped_column(String(10), server_default="free")
    # Stripe linkage. renews/cancel mirror the subscription state from webhook
    # events so /api/billing/summary never has to call Stripe.
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True, unique=True
    )
    plus_renews_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    plus_cancel_at_period_end: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )
    # External sign-in links ("Continue with Google"). fastapi-users reads
    # this attribute by name when a returning OAuth user signs in, so it is
    # eager-loaded — the session is closed by the time a route sees the user.
    oauth_accounts: Mapped[list[OAuthAccount]] = relationship(
        lazy="selectin", cascade="all, delete-orphan"
    )
