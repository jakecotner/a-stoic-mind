"""DB access for the corpus. Read-only: passages are ingested by
scripts/ingest/, never written by the app."""
import uuid

from sqlalchemy import Row, func, select
from sqlalchemy.orm import Session

from app.models import Passage, PassageBreakdown


def get(db: Session, passage_id: uuid.UUID) -> Passage | None:
    return db.get(Passage, passage_id)


def get_by_reference(db: Session, reference: str) -> Passage | None:
    return db.scalar(select(Passage).where(Passage.reference == reference))


def list_works(db: Session, tradition: str | None = None) -> list[Row]:
    """Works, one row each: author, work, translator, passage_count,
    original_language (non-null when the original text is ingested).
    `tradition` narrows to one tradition; None returns the whole corpus."""
    stmt = (
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
    if tradition is not None:
        stmt = stmt.where(Passage.tradition == tradition)
    return list(db.execute(stmt))


def for_work(db: Session, work: str) -> list[Passage]:
    return list(
        db.scalars(
            select(Passage).where(Passage.work == work).order_by(Passage.position)
        )
    )


def get_breakdown(
    db: Session, passage_id: uuid.UUID, language: str
) -> PassageBreakdown | None:
    return db.get(PassageBreakdown, (passage_id, language))


def insert_breakdown(
    db: Session, passage_id: uuid.UUID, language: str, text: str, model: str
) -> PassageBreakdown:
    row = PassageBreakdown(
        passage_id=passage_id, language=language, text=text, model=model
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
