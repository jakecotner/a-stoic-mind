"""Superuser-only routes: manual tier control and the usage rollup."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import current_superuser
from app.core.db import get_db
from app.models import User
from app.schemas.admin import (
    AdminStatsOut,
    AdminUserRow,
    TierUpdate,
    UsageSummaryRow,
)
from app.services import admin as admin_service

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsOut)
def stats(
    db: Session = Depends(get_db),
    _: User = Depends(current_superuser),
) -> AdminStatsOut:
    return admin_service.stats(db)


@router.get("/users", response_model=list[AdminUserRow])
def user_list(
    db: Session = Depends(get_db),
    _: User = Depends(current_superuser),
) -> list[AdminUserRow]:
    return admin_service.user_list(db)


@router.post("/users/{user_id}/tier")
def set_tier(
    user_id: uuid.UUID,
    body: TierUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(current_superuser),
) -> dict:
    target = admin_service.set_tier(db, user_id, body.tier)
    return {"id": str(target.id), "email": target.email, "tier": target.tier}


@router.get("/usage", response_model=list[UsageSummaryRow])
def usage_summary(
    db: Session = Depends(get_db),
    _: User = Depends(current_superuser),
) -> list[UsageSummaryRow]:
    return [UsageSummaryRow(**row._mapping) for row in admin_service.usage_summary(db)]
