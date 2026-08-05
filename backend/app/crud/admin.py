"""Read-only aggregates for the admin console. Every function returns plain
rows or dicts keyed by user id; the service layer assembles them into the
response shapes."""
import uuid
from datetime import date

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.models import (
    Conversation,
    JournalEntry,
    LlmUsage,
    Message,
    Note,
    PassageRead,
    PracticeSession,
    User,
)


def all_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.email)))


def totals(db: Session) -> dict[str, int]:
    def count(stmt) -> int:
        return db.scalar(stmt) or 0

    return {
        "users": count(select(func.count()).select_from(User)),
        "verified_users": count(
            select(func.count()).select_from(User).where(User.is_verified)
        ),
        "plus_users": count(
            select(func.count()).select_from(User).where(User.tier == "plus")
        ),
        "journal_entries": count(select(func.count()).select_from(JournalEntry)),
        "conversations": count(select(func.count()).select_from(Conversation)),
        "chat_turns": count(
            select(func.count()).select_from(Message).where(Message.role == "user")
        ),
        "practice_sessions": count(
            select(func.count())
            .select_from(PracticeSession)
            .where(PracticeSession.ended_at.is_not(None))
        ),
        "passages_read": count(select(func.count()).select_from(PassageRead)),
        "notes": count(select(func.count()).select_from(Note)),
    }


# --- per-user counts (dict[user_id, count]) for the user list


def _count_by_user(db: Session, model) -> dict[uuid.UUID, int]:
    return dict(
        db.execute(
            select(model.user_id, func.count())
            .where(model.user_id.is_not(None))
            .group_by(model.user_id)
        ).all()
    )


def journal_by_user(db: Session) -> dict[uuid.UUID, int]:
    return _count_by_user(db, JournalEntry)


def sessions_by_user(db: Session) -> dict[uuid.UUID, int]:
    return dict(
        db.execute(
            select(PracticeSession.user_id, func.count())
            .where(PracticeSession.ended_at.is_not(None))
            .group_by(PracticeSession.user_id)
        ).all()
    )


def reads_by_user(db: Session) -> dict[uuid.UUID, int]:
    return _count_by_user(db, PassageRead)


def notes_by_user(db: Session) -> dict[uuid.UUID, int]:
    return _count_by_user(db, Note)


def chat_turns_by_user(db: Session) -> dict[uuid.UUID, int]:
    return dict(
        db.execute(
            select(Conversation.user_id, func.count())
            .join(Message, Message.conversation_id == Conversation.id)
            .where(Message.role == "user", Conversation.user_id.is_not(None))
            .group_by(Conversation.user_id)
        ).all()
    )


def last_active_by_user(db: Session) -> dict[uuid.UUID, object]:
    """Latest activity timestamp per user across everything they can do.
    Merged with max() because one user may appear in several tables."""
    latest: dict[uuid.UUID, object] = {}
    stmts = [
        select(JournalEntry.user_id, func.max(JournalEntry.updated_at)).group_by(
            JournalEntry.user_id
        ),
        select(PracticeSession.user_id, func.max(PracticeSession.started_at)).group_by(
            PracticeSession.user_id
        ),
        select(PassageRead.user_id, func.max(PassageRead.created_at)).group_by(
            PassageRead.user_id
        ),
        select(Note.user_id, func.max(Note.updated_at)).group_by(Note.user_id),
        select(Conversation.user_id, func.max(Message.created_at))
        .join(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.user_id.is_not(None))
        .group_by(Conversation.user_id),
        select(LlmUsage.user_id, func.max(LlmUsage.created_at))
        .where(LlmUsage.user_id.is_not(None))
        .group_by(LlmUsage.user_id),
    ]
    for stmt in stmts:
        for user_id, stamp in db.execute(stmt).all():
            if user_id not in latest or stamp > latest[user_id]:
                latest[user_id] = stamp
    return latest


# --- per-day activity series


def _count_by_day(db: Session, day_col, since: date, *where) -> dict[date, int]:
    return dict(
        db.execute(
            select(day_col, func.count()).where(day_col >= since, *where).group_by(day_col)
        ).all()
    )


def daily_activity(db: Session, since: date) -> dict[str, dict[date, int]]:
    message_day = cast(Message.created_at, Date)
    return {
        "journal_entries": _count_by_day(db, JournalEntry.date, since),
        "chat_turns": _count_by_day(db, message_day, since, Message.role == "user"),
        "practice_sessions": _count_by_day(
            db, PracticeSession.date, since, PracticeSession.ended_at.is_not(None)
        ),
        "passages_read": _count_by_day(db, PassageRead.date, since),
        "notes": _count_by_day(db, Note.date, since),
    }


def daily_llm_usage(db: Session, since: date):
    """Day × model token sums. Cost math stays client-side (see
    services/admin.py docstring)."""
    day = cast(LlmUsage.created_at, Date).label("day")
    return db.execute(
        select(
            day,
            LlmUsage.model,
            func.count().label("calls"),
            func.sum(LlmUsage.input_tokens).label("input_tokens"),
            func.sum(LlmUsage.output_tokens).label("output_tokens"),
            func.sum(LlmUsage.cache_creation_input_tokens).label(
                "cache_creation_input_tokens"
            ),
            func.sum(LlmUsage.cache_read_input_tokens).label("cache_read_input_tokens"),
        )
        .where(LlmUsage.created_at >= since)
        .group_by(day, LlmUsage.model)
        .order_by(day)
    ).all()
