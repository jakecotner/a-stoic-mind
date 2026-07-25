"""Organizations, memberships, and invites (orgs/RBAC module — delete this
file, and its imports in models/__init__.py, if the app is solo-user; see
MODULES.md).

Ownership model: an Organization is owned by the user who created it
(owner_id). Deleting the owner's account deletes their organizations —
memberships and invites cascade with them. Billing stays on the OWNER's
user row ("owner pays"): the org's effective tier is its owner's tier, so
the billing module needs no changes in teams mode.
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    name: Mapped[str] = mapped_column(String(200))
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # passive_deletes: the DB's ON DELETE CASCADE removes children; without
    # it SQLAlchemy nulls the (NOT NULL) child FKs first and the delete 500s.
    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="organization",
        order_by="Membership.created_at",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Membership(Base):
    """A user's seat in an organization. role: "owner" | "admin" | "member" —
    exactly one owner per org (the creator; also organizations.owner_id)."""

    __tablename__ = "memberships"
    __table_args__ = (UniqueConstraint("org_id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    role: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="memberships")


class OrgInvite(Base):
    """A pending invitation, addressed to an email (the invitee may not have
    an account yet). Accepting requires signing in with the invited address;
    the row is deleted on acceptance."""

    __tablename__ = "org_invites"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    org_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        index=True,
    )
    email: Mapped[str] = mapped_column(String(320), index=True)
    role: Mapped[str] = mapped_column(String(10))  # "admin" | "member"
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
