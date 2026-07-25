"""Superuser-only operations. Cost math stays client-side so pricing changes
don't require a deploy."""
import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import usage as usage_crud
from app.crud import user as user_crud
from app.models import User

TIERS = {"free", "plus"}


def set_tier(db: Session, user_id: uuid.UUID, tier: str) -> User:
    """Manual tier flip (Stripe webhooks own tier in normal operation)."""
    if tier not in TIERS:
        raise HTTPException(422, f"tier must be one of {sorted(TIERS)}")
    target = user_crud.get(db, user_id)
    if target is None:
        raise HTTPException(404, "User not found")
    target.tier = tier
    db.commit()
    return target


def usage_summary(db: Session):
    return usage_crud.monthly_rollup(db)
