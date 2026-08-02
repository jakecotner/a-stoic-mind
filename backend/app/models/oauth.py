import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class OAuthAccount(Base):
    """One external sign-in account (today: Google) linked to a user.

    Column names and types mirror fastapi-users' own OAuth account table —
    the UserManager writes this dict verbatim (see app/core/auth.py's
    SyncSQLAlchemyUserDatabase.add_oauth_account), so renaming a field here
    breaks that contract.
    """

    __tablename__ = "oauth_accounts"
    __table_args__ = (
        # One external account maps to at most one user: the pair is what a
        # returning sign-in is looked up by.
        UniqueConstraint("oauth_name", "account_id", name="uq_oauth_provider_account"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # Provider key, e.g. "google" (httpx-oauth's client .name).
    oauth_name: Mapped[str] = mapped_column(String(100))
    access_token: Mapped[str] = mapped_column(String(1024))
    expires_at: Mapped[int | None] = mapped_column(Integer, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    # The provider's stable id for the account (Google's "sub").
    account_id: Mapped[str] = mapped_column(String(320), index=True)
    account_email: Mapped[str] = mapped_column(String(320))
