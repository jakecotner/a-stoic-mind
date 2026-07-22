"""Superuser-only cost accounting (MONETIZATION.md slice 1).

Read-only monthly rollup of llm_usage. Cost math stays client-side so pricing
changes don't require a deploy.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import current_superuser
from app.db import get_db
from app.models import LlmUsage, User

router = APIRouter(prefix="/api/admin", tags=["admin"])

TIERS = {"free", "plus"}


class TierUpdate(BaseModel):
    tier: str


@router.post("/users/{user_id}/tier")
def set_tier(
    user_id: uuid.UUID,
    body: TierUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(current_superuser),
) -> dict:
    """Manual tier flip until Stripe webhooks own this (slice 3)."""
    if body.tier not in TIERS:
        raise HTTPException(422, f"tier must be one of {sorted(TIERS)}")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found")
    target.tier = body.tier
    db.commit()
    return {"id": str(target.id), "email": target.email, "tier": target.tier}


class UsageSummaryRow(BaseModel):
    month: datetime
    user_id: uuid.UUID | None  # None = shared artifacts / anonymous chat
    kind: str
    model: str
    calls: int
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int


@router.get("/usage", response_model=list[UsageSummaryRow])
def usage_summary(
    db: Session = Depends(get_db),
    _: User = Depends(current_superuser),
) -> list[UsageSummaryRow]:
    month = func.date_trunc("month", LlmUsage.created_at).label("month")
    rows = db.execute(
        select(
            month,
            LlmUsage.user_id,
            LlmUsage.kind,
            LlmUsage.model,
            func.count().label("calls"),
            func.sum(LlmUsage.input_tokens).label("input_tokens"),
            func.sum(LlmUsage.output_tokens).label("output_tokens"),
            func.sum(LlmUsage.cache_creation_input_tokens).label(
                "cache_creation_input_tokens"
            ),
            func.sum(LlmUsage.cache_read_input_tokens).label(
                "cache_read_input_tokens"
            ),
        )
        .group_by(month, LlmUsage.user_id, LlmUsage.kind, LlmUsage.model)
        .order_by(month.desc())
    ).all()
    return [UsageSummaryRow(**row._mapping) for row in rows]
