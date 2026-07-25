"""Org-role route gates (orgs/RBAC module — delete this file with it).

require_org_role("admin") returns a FastAPI dependency for routes with an
{org_id} path parameter: it resolves the caller's membership and 403s below
the required role. Roles are hierarchical: member < admin < owner.

Non-members get a 404, not a 403, so org ids aren't confirmed to exist —
the same shape chat uses for conversation ids. Superusers get NO bypass:
org data is customer data, and the admin surface (routes/admin.py) is
deliberately aggregate-only.

Lives in core/ (like the auth dependencies it composes) even though it
imports crud — cross-cutting gate wiring is what core is for.
"""
import uuid

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import current_active_user
from app.core.db import get_db
from app.crud import org as org_crud
from app.models import Membership, User

ROLE_ORDER = {"member": 0, "admin": 1, "owner": 2}


def require_org_role(minimum: str):
    if minimum not in ROLE_ORDER:  # fail at wiring time, not request time
        raise ValueError(f"unknown role {minimum!r}")

    def dependency(
        org_id: uuid.UUID,
        db: Session = Depends(get_db),
        user: User = Depends(current_active_user),
    ) -> Membership:
        membership = org_crud.membership(db, org_id, user.id)
        if membership is None:
            raise HTTPException(404, "Organization not found")
        if ROLE_ORDER[membership.role] < ROLE_ORDER[minimum]:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "role_required",
                    "message": f"This action needs the {minimum} role.",
                },
            )
        return membership

    return dependency
