"""DB access for the orgs/RBAC module (delete with it). Functions take a
Session and return ORM objects; no HTTP concepts. Writes commit unless
noted."""
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Membership, Organization, OrgInvite, User


def get(db: Session, org_id: uuid.UUID) -> Organization | None:
    return db.get(Organization, org_id)


def create(db: Session, name: str, owner_id: uuid.UUID) -> tuple[Organization, Membership]:
    """One commit creates the org AND its owner membership — an org without
    an owner seat must never exist."""
    org = Organization(name=name, owner_id=owner_id)
    db.add(org)
    db.flush()  # assigns org.id
    membership = Membership(org_id=org.id, user_id=owner_id, role="owner")
    db.add(membership)
    db.commit()
    db.refresh(org)
    db.refresh(membership)
    return org, membership


def delete(db: Session, org: Organization) -> None:
    db.delete(org)  # memberships and invites cascade (FK ondelete)
    db.commit()


def membership(
    db: Session, org_id: uuid.UUID, user_id: uuid.UUID
) -> Membership | None:
    return db.scalar(
        select(Membership).where(
            Membership.org_id == org_id, Membership.user_id == user_id
        )
    )


def orgs_for_user(
    db: Session, user_id: uuid.UUID
) -> list[tuple[Organization, Membership]]:
    rows = db.execute(
        select(Organization, Membership)
        .join(Membership, Membership.org_id == Organization.id)
        .where(Membership.user_id == user_id)
        .order_by(Organization.created_at)
    )
    return [(org, m) for org, m in rows]


def members(db: Session, org_id: uuid.UUID) -> list[tuple[Membership, User]]:
    rows = db.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.org_id == org_id)
        .order_by(Membership.created_at)
    )
    return [(m, u) for m, u in rows]


def add_member(
    db: Session, org_id: uuid.UUID, user_id: uuid.UUID, role: str
) -> Membership:
    m = Membership(org_id=org_id, user_id=user_id, role=role)
    db.add(m)
    db.commit()
    db.refresh(m)
    return m


def set_role(db: Session, m: Membership, role: str) -> Membership:
    m.role = role
    db.commit()
    db.refresh(m)
    return m


def remove_member(db: Session, m: Membership) -> None:
    db.delete(m)
    db.commit()


def create_invite(
    db: Session,
    org_id: uuid.UUID,
    email: str,
    role: str,
    token: str,
    expires_at: datetime,
) -> OrgInvite:
    invite = OrgInvite(
        org_id=org_id,
        email=email.lower(),
        role=role,
        token=token,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


def get_invite(db: Session, org_id: uuid.UUID, invite_id: uuid.UUID) -> OrgInvite | None:
    invite = db.get(OrgInvite, invite_id)
    return invite if invite is not None and invite.org_id == org_id else None


def get_invite_by_token(db: Session, token: str) -> OrgInvite | None:
    return db.scalar(select(OrgInvite).where(OrgInvite.token == token))


def pending_invite(db: Session, org_id: uuid.UUID, email: str) -> OrgInvite | None:
    return db.scalar(
        select(OrgInvite).where(
            OrgInvite.org_id == org_id,
            func.lower(OrgInvite.email) == email.lower(),
        )
    )


def invites_for_org(db: Session, org_id: uuid.UUID) -> list[OrgInvite]:
    return list(
        db.scalars(
            select(OrgInvite)
            .where(OrgInvite.org_id == org_id)
            .order_by(OrgInvite.created_at)
        )
    )


def delete_invite(db: Session, invite: OrgInvite) -> None:
    db.delete(invite)
    db.commit()
