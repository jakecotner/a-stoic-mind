"""Journal business rules: ownership, the entry-date stamp, and the
metered LLM reflection on an entry.

Entries are strictly private to their owner. Someone else's entry id gets a
404, not a 403 — entry ids are not confirmed to exist for non-owners.
"""
import logging
import uuid
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.auth import ensure_verified
from app.core.config import get_settings
from app.crud import journal as journal_crud
from app.crud import passage as passage_crud
from app.models import JournalEntry, User
from app.services import llm
from app.services.usage import enforce_turn_cap, record_usage

logger = logging.getLogger(__name__)


def create_entry(
    db: Session, user: User, content: str, passage_id: uuid.UUID | None
) -> JournalEntry:
    if passage_id is not None and passage_crud.get(db, passage_id) is None:
        raise HTTPException(404, "Passage not found")
    # Stamped with the same local-date clock services/daily.py uses, so the
    # pad and the practice calendar agree on what "today" means. The user's
    # tradition is stamped too — it decides the reflection's voice, forever.
    return journal_crud.create(
        db, user.id, content, passage_id, date.today(), user.tradition
    )


def _owned(db: Session, user: User, entry_id: uuid.UUID) -> JournalEntry:
    entry = journal_crud.get(db, entry_id)
    if entry is None or entry.user_id != user.id:
        raise HTTPException(404, "Entry not found")
    return entry


def update_entry(
    db: Session, user: User, entry_id: uuid.UUID, content: str
) -> JournalEntry:
    return journal_crud.update(db, _owned(db, user, entry_id), content)


def delete_entry(db: Session, user: User, entry_id: uuid.UUID) -> None:
    journal_crud.delete(db, _owned(db, user, entry_id))


def reflect_on_entry(
    db: Session, user: User, entry_id: uuid.UUID
) -> JournalEntry:
    """Write the LLM reflection onto an entry (once — repeat calls return
    the stored one without spending a turn). Metered: free tier gets a
    monthly allowance, Plus is uncapped; unverified accounts are asked to
    verify first when the flavor is on."""
    entry = _owned(db, user, entry_id)
    if entry.reflection is not None:
        return entry
    ensure_verified(user)
    enforce_turn_cap(db, user)
    if not get_settings().anthropic_api_key:
        raise HTTPException(503, "Reflections aren't available right now.")
    passage = (
        passage_crud.get(db, entry.passage_id)
        if entry.passage_id is not None
        else None
    )
    try:
        text, message = llm.write_reflection(
            entry.content, passage, entry.tradition
        )
    except Exception:
        logger.exception("reflection generation failed for entry %s", entry.id)
        raise HTTPException(503, "Reflections aren't available right now.")
    record_usage("reflection", message, user.id)
    return journal_crud.set_reflection(db, entry, text, message.model)


def stats(db: Session, user: User) -> tuple[int, int]:
    """(total entries, current streak in days).

    The streak counts consecutive days with at least one entry, walking back
    from today. A day without an entry yet doesn't break it: writing daily
    through yesterday still shows that run until today ends.
    """
    total = journal_crud.count_for_user(db, user.id)
    dates = journal_crud.distinct_dates_desc(db, user.id)
    today = date.today()
    streak = 0
    expected = today
    for d in dates:
        if d == expected:
            streak += 1
            expected -= timedelta(days=1)
        elif d == today - timedelta(days=1) and streak == 0:
            # No entry yet today — the streak stands, counted from yesterday.
            streak = 1
            expected = d - timedelta(days=1)
        else:
            break
    return total, streak
