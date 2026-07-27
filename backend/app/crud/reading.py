"""DB access for margin notes and reading history."""
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Note, Passage, PassageRead


def create_note(
    db: Session,
    user_id: uuid.UUID,
    passage_id: uuid.UUID,
    content: str,
    note_date: date,
) -> Note:
    note = Note(
        user_id=user_id, passage_id=passage_id, content=content, date=note_date
    )
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


def get_note(db: Session, note_id: uuid.UUID) -> Note | None:
    return db.get(Note, note_id)


def notes_for_passage(
    db: Session, user_id: uuid.UUID, passage_id: uuid.UUID
) -> list[Note]:
    return list(
        db.scalars(
            select(Note)
            .where(Note.user_id == user_id, Note.passage_id == passage_id)
            .order_by(Note.created_at)
        )
    )


def notes_for_work(db: Session, user_id: uuid.UUID, work: str) -> list[Note]:
    return list(
        db.scalars(
            select(Note)
            .join(Passage, Note.passage_id == Passage.id)
            .where(Note.user_id == user_id, Passage.work == work)
            .order_by(Note.created_at)
        )
    )


def update_note(db: Session, note: Note, content: str) -> Note:
    note.content = content
    db.commit()
    db.refresh(note)
    return note


def delete_note(db: Session, note: Note) -> None:
    db.delete(note)
    db.commit()


def read_passage_ids_for_work(
    db: Session, user_id: uuid.UUID, work: str
) -> list[uuid.UUID]:
    return list(
        db.scalars(
            select(PassageRead.passage_id)
            .join(Passage, Passage.id == PassageRead.passage_id)
            .where(PassageRead.user_id == user_id, Passage.work == work)
            .distinct()
        )
    )


def insert_reads(
    db: Session, user_id: uuid.UUID, passage_ids: list[uuid.UUID], on: date
) -> int:
    """Record reads for today, ignoring passages already marked today.
    Returns how many rows were actually inserted."""
    if not passage_ids:
        return 0
    stmt = (
        pg_insert(PassageRead)
        .values(
            [
                {"user_id": user_id, "passage_id": pid, "date": on}
                for pid in passage_ids
            ]
        )
        .on_conflict_do_nothing(index_elements=["user_id", "passage_id", "date"])
        # rowcount is unreliable for multi-row ON CONFLICT inserts (psycopg
        # reports -1); RETURNING yields exactly the rows actually inserted.
        .returning(PassageRead.id)
    )
    inserted = len(db.execute(stmt).fetchall())
    db.commit()
    return inserted
