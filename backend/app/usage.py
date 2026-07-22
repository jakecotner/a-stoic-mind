"""LLM usage accounting and free-tier caps (MONETIZATION.md slices 1–2).

Recording (slice 1): one row per Claude call, from the final streamed
message. Best-effort: a metering failure must never break the user-facing
response, so errors are logged and swallowed. Uses its own session because
call sites are streaming generators that may outlive their request-scoped
session.

Cap (slice 2): free-tier users get a monthly allowance of reflection turns,
counted from llm_usage over the current calendar month (UTC). "plus" and
superusers are uncapped. Anonymous chat gets the same allowance per IP via an
in-memory sliding window — resets on restart, which is acceptable: the goal
is a nudge toward signup, not airtight enforcement (multi-account abuse costs
cents; see MONETIZATION.md §7).
"""
import logging
import threading
import time
import uuid
from datetime import datetime, timezone

import anthropic
from fastapi import HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal
from app.models import LlmUsage, User

logger = logging.getLogger(__name__)


def record_usage(
    kind: str,
    message: anthropic.types.Message,
    user_id: uuid.UUID | None = None,
) -> None:
    try:
        usage = message.usage
        with SessionLocal() as db:
            db.add(
                LlmUsage(
                    user_id=user_id,
                    kind=kind,
                    model=message.model,
                    input_tokens=usage.input_tokens,
                    output_tokens=usage.output_tokens,
                    cache_creation_input_tokens=usage.cache_creation_input_tokens
                    or 0,
                    cache_read_input_tokens=usage.cache_read_input_tokens or 0,
                )
            )
            db.commit()
    except Exception:
        logger.exception("failed to record llm usage (kind=%s)", kind)


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def reflection_turns_this_month(db: Session, user_id: uuid.UUID) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(LlmUsage)
            .where(
                LlmUsage.user_id == user_id,
                LlmUsage.kind == "reflection_turn",
                LlmUsage.created_at >= _month_start(),
            )
        )
        or 0
    )


def _cap_error(scope: str, used: int | None, limit: int) -> HTTPException:
    return HTTPException(
        status_code=402,
        detail={
            "code": "reflection_cap",
            "scope": scope,  # "free" -> upgrade nudge; "anonymous" -> sign-in nudge
            "used": used,
            "limit": limit,
        },
    )


class _AnonWindow:
    """Sliding-window turn counter per IP (same shape as ratelimit.MissCap,
    but raises the structured 402 the frontend turns into a sign-in nudge)."""

    def __init__(self, window_seconds: float) -> None:
        self._window = window_seconds
        self._log: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, request: Request, limit: int) -> None:
        ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
            request.client.host if request.client else "unknown"
        )
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._log.get(ip, []) if now - t < self._window]
            if len(recent) >= limit:
                raise _cap_error("anonymous", len(recent), limit)
            recent.append(now)
            self._log[ip] = recent


_anon_turns = _AnonWindow(window_seconds=30 * 24 * 3600.0)


def enforce_reflection_cap(
    db: Session, user: User | None, request: Request
) -> None:
    """Raise 402 when the requester is out of free reflection turns."""
    limit = get_settings().free_tier_monthly_turns
    if user is None:
        _anon_turns.check(request, limit)
        return
    if user.is_superuser or user.tier == "plus":
        return
    used = reflection_turns_this_month(db, user.id)
    if used >= limit:
        raise _cap_error("free", used, limit)
