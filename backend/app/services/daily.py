"""The daily passage: lazy assignment and the cached LLM breakdown.

Everything is per tradition — each tradition has its own passage of the day,
drawn from its own curated pool. Assignment happens on the first request for
a (date, tradition) — usually today via the landing page, but the practice
calendar can request any past or future date and the pick becomes permanent
then. It's a random pick from the curated passages that haven't been used
yet, cycling through the least-recently-used once the pool is exhausted. The
unique(date, tradition) constraint is the race guard — a concurrent first
visitor loses the insert and refetches.

The breakdown comes from the shared per-passage cache (services/breakdown.py)
— generated on first view, cached forever. No ANTHROPIC_API_KEY, or an API
error, degrades to breakdown=None — the passage always renders.
"""
import logging
import random
from datetime import date as date_type

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.crud import daily as daily_crud
from app.models import DailyPassage
from app.services.breakdown import breakdown_for
from app.services.tradition import DEFAULT_TRADITION, ensure_available

logger = logging.getLogger(__name__)


def get_today(
    db: Session, tradition: str = DEFAULT_TRADITION
) -> tuple[DailyPassage, str | None]:
    """Today's passage and its breakdown text (None when unavailable).
    `tradition` is client-supplied here (the public landing page), so it is
    validated — unavailable traditions have no corpus to serve."""
    ensure_available(tradition)
    daily = get_or_assign(db, date_type.today(), tradition)
    breakdown = breakdown_for(db, daily.passage, "en")
    return daily, breakdown


def get_or_assign(db: Session, on: date_type, tradition: str) -> DailyPassage:
    """The passage for any date, assigned now if this is its first request."""
    daily = daily_crud.get_by_date(db, on, tradition)
    if daily is None:
        daily = _assign(db, on, tradition)
    return daily


def _assign(db: Session, on: date_type, tradition: str) -> DailyPassage:
    candidates = daily_crud.unused_curated_ids(db, tradition)
    if candidates:
        passage_id = random.choice(candidates)
    else:
        passage_id = daily_crud.least_recently_used_curated_id(db, tradition)
    if passage_id is None:
        # Unseeded curated pool (fresh install) — keep the landing page alive.
        logger.warning(
            "no curated %s passages — assigning an arbitrary one", tradition
        )
        passage_id = daily_crud.any_passage_id(db, tradition)
    assert passage_id is not None, f"{tradition} corpus is empty"
    try:
        daily_crud.insert(db, on, passage_id, tradition)
    except IntegrityError:
        db.rollback()  # concurrent first visitor won the insert
    daily = daily_crud.get_by_date(db, on, tradition)
    assert daily is not None
    return daily
