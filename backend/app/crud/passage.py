"""DB access for the corpus. Read-only: passages are ingested by
scripts/ingest/, never written by the app."""
import uuid

from sqlalchemy import Row, func, select
from sqlalchemy.orm import Session

from app.models import Passage


def get(db: Session, passage_id: uuid.UUID) -> Passage | None:
    return db.get(Passage, passage_id)


def get_by_reference(db: Session, reference: str) -> Passage | None:
    return db.scalar(select(Passage).where(Passage.reference == reference))


def list_works(db: Session) -> list[Row]:
    """One row per work: author, work, translator, passage_count,
    original_language (non-null when the original text is ingested)."""
    return list(
        db.execute(
            select(
                Passage.author,
                Passage.work,
                Passage.translator,
                func.count().label("passage_count"),
                func.max(Passage.original_language).label("original_language"),
            )
            .group_by(Passage.author, Passage.work, Passage.translator)
            .order_by(Passage.author, Passage.work)
        )
    )


def for_work(db: Session, work: str) -> list[Passage]:
    return list(
        db.scalars(
            select(Passage).where(Passage.work == work).order_by(Passage.position)
        )
    )
