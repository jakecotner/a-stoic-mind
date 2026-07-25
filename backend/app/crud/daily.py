"""DB access for daily passage assignment."""
import uuid
from datetime import date

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session, joinedload

from app.models import DailyPassage, Passage


def get_by_date(db: Session, d: date) -> DailyPassage | None:
    return db.scalar(
        select(DailyPassage)
        .where(DailyPassage.date == d)
        .options(joinedload(DailyPassage.passage))
    )


def insert(db: Session, d: date, passage_id: uuid.UUID) -> DailyPassage:
    row = DailyPassage(date=d, passage_id=passage_id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def unused_curated_ids(db: Session) -> list[uuid.UUID]:
    """Curated passages that have never been the daily passage."""
    used = exists().where(DailyPassage.passage_id == Passage.id)
    return list(
        db.scalars(select(Passage.id).where(Passage.curated, ~used))
    )


def least_recently_used_curated_id(db: Session) -> uuid.UUID | None:
    """When the whole pool has been used, cycle: the curated passage whose
    last appearance is oldest."""
    return db.scalar(
        select(DailyPassage.passage_id)
        .join(Passage, Passage.id == DailyPassage.passage_id)
        .where(Passage.curated)
        .group_by(DailyPassage.passage_id)
        .order_by(func.max(DailyPassage.date))
        .limit(1)
    )


def any_passage_id(db: Session) -> uuid.UUID | None:
    """Fallback for an unseeded pool: any passage at all."""
    return db.scalar(select(Passage.id).order_by(func.random()).limit(1))
