"""Passage breakdowns: generated once per (passage, language), cached
forever (the corpus is immutable). Shared by the daily passage and the
library reader — the first viewer anywhere pays the generation; everyone
after reads the cache.

No ANTHROPIC_API_KEY, or an API error, degrades to None — the passage
always renders without its breakdown.
"""
import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.crud import passage as passage_crud
from app.models import Passage
from app.services import llm
from app.services.usage import record_usage

logger = logging.getLogger(__name__)


def breakdown_for(db: Session, passage: Passage, language: str) -> str | None:
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
