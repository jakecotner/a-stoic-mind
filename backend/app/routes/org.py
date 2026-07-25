"""Org routes (orgs/RBAC module — delete with it). Thin: the role gate is a
dependency (core/rbac.py), the rules live in services/org.py."""
import uuid

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.auth import current_active_user, current_verified_user
from app.core.config import get_settings
from app.core.db import get_db
from app.core.rbac import require_org_role
from app.models import Membership, User
from app.schemas.org import (
    AcceptInviteRequest,
    InviteCreate,
    InviteOut,
    MemberOut,
    OrgCreate,
    OrgOut,
    RoleUpdate,
)
from app.services import org as org_service

router = APIRouter(prefix="/api/orgs", tags=["orgs"])


def _base_url(request: Request) -> str:
    """Frontend origin for links in invite emails — same resolution order as
    routes/billing.py."""
    settings = get_settings()
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")
    return str(request.base_url).rstrip("/")


@router.post("", response_model=OrgOut)
def create_org(
    req: OrgCreate,
    db: Session = Depends(get_db),
    # verified gate: no-op unless REQUIRE_EMAIL_VERIFICATION is on
    user: User = Depends(current_verified_user),
):
    return org_service.create_org(db, user, req.name)


@router.get("", response_model=list[OrgOut])
def list_orgs(
    db: Session = Depends(get_db), user: User = Depends(current_active_user)
):
    return org_service.list_orgs(db, user)


@router.post("/accept-invite", response_model=OrgOut)
def accept_invite(
    req: AcceptInviteRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    return org_service.accept_invite(db, user, req.token)


@router.get("/{org_id}", response_model=OrgOut)
def get_org(
    db: Session = Depends(get_db),
    membership: Membership = Depends(require_org_role("member")),
):
    return org_service.get_org(db, membership)


@router.delete("/{org_id}", status_code=204)
def delete_org(
    db: Session = Depends(get_db),
    membership: Membership = Depends(require_org_role("owner")),
):
    org_service.delete_org(db, membership)


@router.get("/{org_id}/members", response_model=list[MemberOut])
def list_members(
    db: Session = Depends(get_db),
    membership: Membership = Depends(require_org_role("member")),
):
    return org_service.list_members(db, membership.org_id)


@router.patch("/{org_id}/members/{user_id}", response_model=MemberOut)
def change_role(
    user_id: uuid.UUID,
    req: RoleUpdate,
    db: Session = Depends(get_db),
    membership: Membership = Depends(require_org_role("admin")),
):
    return org_service.change_role(db, membership, user_id, req.role)


@router.delete("/{org_id}/members/{user_id}", status_code=204)
def remove_member(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    membership: Membership = Depends(require_org_role("admin")),
):
    org_service.remove_member(db, membership, user_id)


@router.post("/{org_id}/leave", status_code=204)
def leave_org(
    db: Session = Depends(get_db),
    membership: Membership = Depends(require_org_role("member")),
):
    org_service.leave_org(db, membership)


@router.post("/{org_id}/invites", response_model=InviteOut)
def create_invite(
    req: InviteCreate,
    request: Request,
    db: Session = Depends(get_db),
    membership: Membership = Depends(require_org_role("admin")),
    # invites send email — verified accounts only (no-op while the flag is off)
    _user: User = Depends(current_verified_user),
):
    return org_service.invite_member(
        db, membership, req.email, req.role, _base_url(request)
    )


@router.get("/{org_id}/invites", response_model=list[InviteOut])
def list_invites(
    db: Session = Depends(get_db),
    membership: Membership = Depends(require_org_role("admin")),
):
    return org_service.list_invites(db, membership.org_id)


@router.delete("/{org_id}/invites/{invite_id}", status_code=204)
def revoke_invite(
    invite_id: uuid.UUID,
    db: Session = Depends(get_db),
    membership: Membership = Depends(require_org_role("admin")),
):
    org_service.revoke_invite(db, membership.org_id, invite_id)
