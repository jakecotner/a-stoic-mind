"""Reader business rules: how works split into reading units (the TOC),
margin-note ownership, and the mark-as-read action.

Works are read in their natural units, derived from the reference locator:

- Meditations              -> book        ("Meditations 4.3"  -> part "4")
- Moral Letters to Lucilius-> letter      ("Letters 13.1-2"   -> part "13")
- Lectures (Musonius)      -> lecture     ("Lectures 16.2"    -> part "16")
- Discourses               -> chapter     ("Discourses 1.15.3"-> part "1.15")
- multi-book essays        -> book        ("Of Anger 2.6"     -> part "2")
- single-book works        -> read whole  ("Enchiridion 5"    -> part "")

The multi-book essays are an explicit set — a locator like "9.2" means
book.chapter in Of Anger but chapter.section in On the Shortness of Life,
so book-ness can't be inferred from the reference shape alone.
"""
import uuid
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.crud import passage as passage_crud
from app.crud import reading as reading_crud
from app.models import Note, Passage, User
from app.schemas.reading import TocPartOut

_LETTERS = "Moral Letters to Lucilius"
_LECTURES = "Lectures"  # Musonius Rufus; 13a/13b-style lecture numbers
_MULTI_BOOK = {"Of Anger", "Of Clemency", "On Benefits"}


def _locator(passage: Passage) -> str:
    """The reference with the work-name prefix stripped: "Letters 13.1-2"
    -> "13.1-2" (the Letters reference uses a short prefix, so strip by the
    last space-separated token group that starts with a digit)."""
    return passage.reference.rsplit(" ", 1)[-1]


def part_key(passage: Passage) -> str:
    bits = _locator(passage).split(".")
    if passage.work == "Discourses":
        return ".".join(bits[:2])
    if (
        passage.work in ("Meditations", _LETTERS, _LECTURES)
        or passage.work in _MULTI_BOOK
    ):
        return bits[0]
    return ""


def _part_label(work: str, key: str) -> str:
    if not key:
        return "Full text"
    if work == "Discourses":
        book, chapter = key.split(".")
        return f"Book {book}, Chapter {chapter}"
    if work == _LETTERS:
        return f"Letter {key}"
    if work == _LECTURES:
        return f"Lecture {key}"
    return f"Book {key}"


def toc(db: Session, work: str) -> list[TocPartOut]:
    passages = passage_crud.for_work(db, work)
    if not passages:
        raise HTTPException(404, "No such work")
    parts: dict[str, int] = {}
    for p in passages:  # already in reading order — dict keeps insertion order
        key = part_key(p)
        parts[key] = parts.get(key, 0) + 1
    return [
        TocPartOut(part=key, label=_part_label(work, key), passage_count=count)
        for key, count in parts.items()
    ]


def passages_for_part(db: Session, work: str, part: str) -> list[Passage]:
    passages = passage_crud.for_work(db, work)
    if not passages:
        raise HTTPException(404, "No such work")
    selected = [p for p in passages if part_key(p) == part]
    if not selected:
        raise HTTPException(404, "No such part")
    return selected


def create_note(
    db: Session, user: User, passage_id: uuid.UUID, content: str
) -> Note:
    if passage_crud.get(db, passage_id) is None:
        raise HTTPException(404, "Passage not found")
    # Same local-date clock as the daily passage and the journal.
    return reading_crud.create_note(db, user.id, passage_id, content, date.today())


def _owned(db: Session, user: User, note_id: uuid.UUID) -> Note:
    note = reading_crud.get_note(db, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(404, "Note not found")
    return note


def update_note(
    db: Session, user: User, note_id: uuid.UUID, content: str
) -> Note:
    return reading_crud.update_note(db, _owned(db, user, note_id), content)


def delete_note(db: Session, user: User, note_id: uuid.UUID) -> None:
    reading_crud.delete_note(db, _owned(db, user, note_id))


def mark_read(db: Session, user: User, work: str, part: str) -> int:
    passages = passages_for_part(db, work, part)
    return reading_crud.insert_reads(
        db, user.id, [p.id for p in passages], date.today()
    )
