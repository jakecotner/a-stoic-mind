"""DB access for LLM usage rows (cost accounting and free-tier caps)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LlmUsage


def insert(
    db: Session,
    *,
    user_id: uuid.UUID | None,
    kind: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    cache_creation_input_tokens: int,
    cache_read_input_tokens: int,
) -> None:
    db.add(
        LlmUsage(
            user_id=user_id,
            kind=kind,
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_creation_input_tokens=cache_creation_input_tokens,
            cache_read_input_tokens=cache_read_input_tokens,
        )
    )
    db.commit()


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def count_turns_this_month(db: Session, user_id: uuid.UUID, kind: str) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(LlmUsage)
            .where(
                LlmUsage.user_id == user_id,
                LlmUsage.kind == kind,
                LlmUsage.created_at >= _month_start(),
            )
        )
        or 0
    )


def monthly_rollup(db: Session):
    """Month × user × kind × model aggregate rows (admin cost dashboard)."""
    month = func.date_trunc("month", LlmUsage.created_at).label("month")
    return db.execute(
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
