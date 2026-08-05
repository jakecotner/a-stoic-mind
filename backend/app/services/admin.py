"""Superuser-only operations. Cost math stays client-side so pricing changes
don't require a deploy."""
import uuid
from datetime import timedelta, timezone
from datetime import datetime as dt

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import admin as admin_crud
from app.crud import usage as usage_crud
from app.crud import user as user_crud
from app.models import User
from app.schemas.admin import (
    AdminDayRow,
    AdminLlmDayRow,
    AdminStatsOut,
    AdminTotals,
    AdminUserRow,
)

TIERS = {"free", "plus"}
STATS_WINDOW_DAYS = 30


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


def stats(db: Session) -> AdminStatsOut:
    """The console's headline numbers: lifetime totals plus a zero-filled
    per-day activity series for the last STATS_WINDOW_DAYS days."""
    today = dt.now(timezone.utc).date()
    since = today - timedelta(days=STATS_WINDOW_DAYS - 1)

    per_day = admin_crud.daily_activity(db, since)
    days = [
        AdminDayRow(
            day=d,
            **{metric: counts.get(d, 0) for metric, counts in per_day.items()},
        )
        for d in (since + timedelta(days=i) for i in range(STATS_WINDOW_DAYS))
    ]

    llm_days = [
        AdminLlmDayRow(**row._mapping)
        for row in admin_crud.daily_llm_usage(db, since)
    ]

    return AdminStatsOut(
        totals=AdminTotals(**admin_crud.totals(db)),
        days=days,
        llm_days=llm_days,
    )


def user_list(db: Session) -> list[AdminUserRow]:
    journal = admin_crud.journal_by_user(db)
    turns = admin_crud.chat_turns_by_user(db)
    sessions = admin_crud.sessions_by_user(db)
    reads = admin_crud.reads_by_user(db)
    notes = admin_crud.notes_by_user(db)
    last_active = admin_crud.last_active_by_user(db)

    return [
        AdminUserRow(
            id=u.id,
            email=u.email,
            tier=u.tier,
            is_verified=u.is_verified,
            is_superuser=u.is_superuser,
            oauth_providers=[a.oauth_name for a in u.oauth_accounts],
            journal_entries=journal.get(u.id, 0),
            chat_turns=turns.get(u.id, 0),
            practice_sessions=sessions.get(u.id, 0),
            passages_read=reads.get(u.id, 0),
            notes=notes.get(u.id, 0),
            last_active=last_active.get(u.id),
        )
        for u in admin_crud.all_users(db)
    ]
