"""The daily passage: lazy assignment and the cached LLM breakdown.

Assignment happens on the first request of a new day: a random pick from the
curated passages that haven't been used yet, cycling through the
least-recently-used once the pool is exhausted. The unique(date) constraint
is the race guard — a concurrent first visitor loses the insert and
refetches.

The breakdown is generated once per (passage, language) and cached forever
(the corpus is immutable). No ANTHROPIC_API_KEY, or an API error, degrades
to breakdown=None — the passage always renders.
"""
import logging
import random
from datetime import date as date_type

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.crud import daily as daily_crud
from app.crud import passage as passage_crud
from app.models import DailyPassage, Passage
from app.services import llm
from app.services.usage import record_usage

logger = logging.getLogger(__name__)


def get_today(db: Session) -> tuple[DailyPassage, str | None]:
    """Today's passage and its breakdown text (None when unavailable)."""
    today = date_type.today()
    daily = daily_crud.get_by_date(db, today)
    if daily is None:
        daily = _assign(db, today)
    breakdown = _breakdown_for(db, daily.passage, "en")
    return daily, breakdown


def _assign(db: Session, today: date_type) -> DailyPassage:
    candidates = daily_crud.unused_curated_ids(db)
    if candidates:
        passage_id = random.choice(candidates)
    else:
        passage_id = daily_crud.least_recently_used_curated_id(db)
    if passage_id is None:
        # Unseeded curated pool (fresh install) — keep the landing page alive.
        logger.warning("no curated passages — assigning an arbitrary passage")
        passage_id = daily_crud.any_passage_id(db)
    assert passage_id is not None, "corpus is empty"
    try:
        daily_crud.insert(db, today, passage_id)
    except IntegrityError:
        db.rollback()  # concurrent first visitor won the insert
    daily = daily_crud.get_by_date(db, today)
    assert daily is not None
    return daily


def _breakdown_for(db: Session, passage: Passage, language: str) -> str | None:
    cached = passage_crud.get_breakdown(db, passage.id, language)
    if cached is not None:
        return cached.text
    if not get_settings().anthropic_api_key:
        return None
    try:
        text, message = llm.write_breakdown(passage)
    except Exception:
        logger.exception("breakdown generation failed for %s", passage.reference)
        return None
    record_usage("breakdown", message)  # global cost, attributed to no user
    try:
        passage_crud.insert_breakdown(
            db, passage.id, language, text, message.model
        )
    except IntegrityError:
        db.rollback()  # concurrent visitor cached it first — theirs wins
        cached = passage_crud.get_breakdown(db, passage.id, language)
        return cached.text if cached is not None else text
    return text
