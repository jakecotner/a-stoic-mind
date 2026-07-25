"""Org business logic (orgs/RBAC module — delete with it).

The role rules, in one place:
- exactly one owner per org — the creator; ownership is not assignable or
  transferable through the API (a deliberate v1 simplification);
- owners and admins manage members, but you can only act on roles strictly
  BELOW your own (admins manage members; only the owner manages admins);
- the owner can't leave — deleting the org is the way out;
- invites are addressed to an email, expire after 7 days, and can only be
  accepted by an account signed in with that address.

Billing is "owner pays": the org's effective tier is its owner's tier
(see effective_tier), so the billing module is untouched by teams mode.
"""
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.rbac import ROLE_ORDER
from app.crud import org as org_crud
from app.crud import user as user_crud
from app.models import Membership, Organization, User
from app.schemas.org import InviteOut, MemberOut, OrgOut
from app.services.email import send_email

logger = logging.getLogger("astoicmind")

INVITE_TTL_DAYS = 7


def _org_out(org: Organization, membership: Membership) -> OrgOut:
    return OrgOut(
        id=org.id, name=org.name, created_at=org.created_at, role=membership.role
    )


def effective_tier(db: Session, org: Organization) -> str:
    """"Owner pays": the org inherits its owner's tier. Gate org-scoped paid
    features with this + core.auth.require_plus on the OWNER row."""
    owner = user_crud.get(db, org.owner_id)
    return owner.tier if owner is not None else "free"


def create_org(db: Session, user: User, name: str) -> OrgOut:
    org, membership = org_crud.create(db, name=name, owner_id=user.id)
    return _org_out(org, membership)


def list_orgs(db: Session, user: User) -> list[OrgOut]:
    return [_org_out(org, m) for org, m in org_crud.orgs_for_user(db, user.id)]


def get_org(db: Session, membership: Membership) -> OrgOut:
    org = org_crud.get(db, membership.org_id)
    assert org is not None  # membership rows can't outlive their org (FK)
    return _org_out(org, membership)


def delete_org(db: Session, membership: Membership) -> None:
    # Route gate already required "owner"; nothing more to check.
    org = org_crud.get(db, membership.org_id)
    if org is not None:
        org_crud.delete(db, org)


def list_members(db: Session, org_id: uuid.UUID) -> list[MemberOut]:
    return [
        MemberOut(
            user_id=user.id,
            email=user.email,
            role=membership.role,
            created_at=membership.created_at,
        )
        for membership, user in org_crud.members(db, org_id)
    ]


def _require_outranks(actor: Membership, target_role: str, action: str) -> None:
    """Actors act only on roles strictly below their own."""
    if ROLE_ORDER[actor.role] <= ROLE_ORDER[target_role]:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "role_required",
                "message": f"Your role can't {action} a {target_role}.",
            },
        )


def change_role(
    db: Session, actor: Membership, target_user_id: uuid.UUID, new_role: str
) -> MemberOut:
    if actor.user_id == target_user_id:
        raise HTTPException(400, "You can't change your own role.")
    target = org_crud.membership(db, actor.org_id, target_user_id)
    if target is None:
        raise HTTPException(404, "Member not found")
    _require_outranks(actor, target.role, "change the role of")
    target = org_crud.set_role(db, target, new_role)
    user = user_crud.get(db, target.user_id)
    assert user is not None
    return MemberOut(
        user_id=user.id,
        email=user.email,
        role=target.role,
        created_at=target.created_at,
    )


def remove_member(
    db: Session, actor: Membership, target_user_id: uuid.UUID
) -> None:
    if actor.user_id == target_user_id:
        raise HTTPException(400, "Use leave to remove yourself.")
    target = org_crud.membership(db, actor.org_id, target_user_id)
    if target is None:
        raise HTTPException(404, "Member not found")
    _require_outranks(actor, target.role, "remove")
    org_crud.remove_member(db, target)


def leave_org(db: Session, membership: Membership) -> None:
    if membership.role == "owner":
        raise HTTPException(
            400, "The owner can't leave — delete the organization instead."
        )
    org_crud.remove_member(db, membership)


def invite_member(
    db: Session,
    actor: Membership,
    email: str,
    role: str,
    base_url: str,
) -> InviteOut:
    _require_outranks(actor, role, "invite an")

    existing_user = user_crud.get_by_email(db, email)
    if (
        existing_user is not None
        and org_crud.membership(db, actor.org_id, existing_user.id) is not None
    ):
        raise HTTPException(409, "That person is already a member.")
    if org_crud.pending_invite(db, actor.org_id, email) is not None:
        raise HTTPException(409, "That email already has a pending invite.")

    org = org_crud.get(db, actor.org_id)
    assert org is not None
    invite = org_crud.create_invite(
        db,
        org_id=actor.org_id,
        email=email,
        role=role,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS),
    )

    settings = get_settings()
    link = f"{base_url.rstrip('/')}/invite?token={invite.token}"
    text = (
        f"You've been invited to join {org.name} on {settings.app_name}.\n\n"
        f"Accept the invitation here (the link works for "
        f"{INVITE_TTL_DAYS} days):\n{link}\n\n"
        f"Sign in with this email address ({email}) — or create an account "
        "with it first — and the invitation will be waiting.\n\n"
        "If you weren't expecting this, you can ignore this email."
    )
    send_email(email, f"You're invited to {org.name}", text)
    return InviteOut.model_validate(invite)


def list_invites(db: Session, org_id: uuid.UUID) -> list[InviteOut]:
    return [
        InviteOut.model_validate(i) for i in org_crud.invites_for_org(db, org_id)
    ]


def revoke_invite(db: Session, org_id: uuid.UUID, invite_id: uuid.UUID) -> None:
    invite = org_crud.get_invite(db, org_id, invite_id)
    if invite is None:
        raise HTTPException(404, "Invite not found")
    org_crud.delete_invite(db, invite)


def accept_invite(db: Session, user: User, token: str) -> OrgOut:
    invite = org_crud.get_invite_by_token(db, token)
    if invite is None or invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "invite_invalid",
                "message": "That invitation has expired or was already used — "
                "ask for a new one.",
            },
        )
    if invite.email.lower() != user.email.lower():
        raise HTTPException(
            status_code=403,
            detail={
                "code": "invite_wrong_email",
                "message": f"This invitation was sent to {invite.email} — "
                "sign in with that address to accept it.",
            },
        )
    existing = org_crud.membership(db, invite.org_id, user.id)
    if existing is not None:  # somehow already in — just consume the invite
        org_crud.delete_invite(db, invite)
        org = org_crud.get(db, invite.org_id)
        assert org is not None
        return _org_out(org, existing)

    membership = org_crud.add_member(db, invite.org_id, user.id, invite.role)
    org_crud.delete_invite(db, invite)
    org = org_crud.get(db, invite.org_id)
    assert org is not None
    logger.info("invite accepted: %s joined org %s", user.email, org.id)
    return _org_out(org, membership)
