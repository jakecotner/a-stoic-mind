"""Billing surface (MONETIZATION.md slice 2; Stripe lands in slice 3).

The response shape mirrors the frontend's BillingSummary (frontend/src/api.ts)
— it shipped ahead of this endpoint and falls back to a bare free tier when
the call fails, so changes here must stay backward-compatible with that type.
/api/billing/checkout and /api/billing/portal intentionally don't exist yet;
the frontend surfaces their absence as "payments aren't live yet".
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import current_active_user
from app.config import get_settings
from app.db import get_db
from app.models import User
from app.usage import reflection_turns_this_month

router = APIRouter(prefix="/api/billing", tags=["billing"])


class Reflections(BaseModel):
    used: int
    limit: int


class BillingSummary(BaseModel):
    tier: str
    reflections: Reflections | None  # null = uncapped (plus, superuser)
    renews_at: str | None  # Stripe-era field; null until slice 3


@router.get("/summary", response_model=BillingSummary)
def billing_summary(
    db: Session = Depends(get_db), user: User = Depends(current_active_user)
) -> BillingSummary:
    if user.is_superuser or user.tier == "plus":
        return BillingSummary(tier=user.tier, reflections=None, renews_at=None)
    return BillingSummary(
        tier=user.tier,
        reflections=Reflections(
            used=reflection_turns_this_month(db, user.id),
            limit=get_settings().free_tier_monthly_turns,
        ),
        renews_at=None,
    )
