"""LLM usage accounting and free-tier caps.

Recording: one row per Claude call. Best-effort: a metering failure must
never break the user-facing response, so errors are logged and swallowed.
Opens its own session so call sites can record after their request-scoped
session is done with other work.

Cap: free-tier users get a monthly allowance of metered turns (today:
journal reflections), counted from llm_usage over the current calendar
month (UTC). "plus" and superusers are uncapped. Breakdowns are NOT
metered — they're a shared cache, recorded with no user for the admin
cost rollup.
"""
import logging
import uuid

import anthropic
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.crud import usage as usage_crud
from app.models import User

logger = logging.getLogger(__name__)

# The usage kind that counts against the free-tier monthly allowance.
METERED_KIND = "reflection"


def record_usage(
    kind: str,
    message: anthropic.types.Message,
    user_id: uuid.UUID | None = None,
) -> None:
    try:
        usage = message.usage
        with SessionLocal() as db:
            usage_crud.insert(
                db,
                user_id=user_id,
                kind=kind,
                model=message.model,
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                cache_creation_input_tokens=usage.cache_creation_input_tokens
                or 0,
                cache_read_input_tokens=usage.cache_read_input_tokens or 0,
            )
    except Exception:
        logger.exception("failed to record llm usage (kind=%s)", kind)


def turns_this_month(db: Session, user_id: uuid.UUID) -> int:
    return usage_crud.count_turns_this_month(db, user_id, METERED_KIND)


def _cap_error(used: int, limit: int) -> HTTPException:
    return HTTPException(
        status_code=402,
        detail={
            "code": "turn_cap",
            "scope": "free",  # -> upgrade nudge in the frontend
            "used": used,
            "limit": limit,
        },
    )


def enforce_turn_cap(db: Session, user: User) -> None:
    """Raise 402 when the user is out of free metered turns this month."""
    if user.is_superuser or user.tier == "plus":
        return
    limit = get_settings().free_tier_monthly_turns
    used = turns_this_month(db, user.id)
    if used >= limit:
        raise _cap_error(used, limit)
