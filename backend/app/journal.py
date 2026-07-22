"""Notes CRUD: margin notes (passage_id set) and journal entries (passage_id
NULL) share one model. Everything requires auth and is scoped to the current
user — a note that exists but belongs to someone else 404s, so note ids are
never confirmed to exist.
"""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.auth import current_active_user
from app.config import get_settings
from app.db import get_db
from app.models import Conversation, Note, Passage, User
from app.retrieval import embed_texts
from app.schemas import NoteCreate, NoteOut, NoteUpdate

logger = logging.getLogger("stoa")

router = APIRouter(prefix="/api/notes", tags=["journal"])


def _embed_note(note: Note) -> None:
    """Best-effort embedding for cross-links (app/related.py). Failures just
    leave embedding NULL — the related-notes lookup backfills lazily."""
    if not get_settings().voyage_api_key:
        return
    try:
        note.embedding = embed_texts([note.content], input_type="document")[0]
    except Exception:
        logger.exception("note embedding failed")


def _stamp_thread_ids(db: Session, notes: list[Note]) -> None:
    """Attach each note's reflection-thread conversation id (if any) so
    NoteOut.thread_id picks it up via from_attributes."""
    ids = [n.id for n in notes]
    threads = (
        dict(
            db.execute(
                select(Conversation.note_id, Conversation.id).where(
                    Conversation.note_id.in_(ids)
                )
            ).all()
        )
        if ids
        else {}
    )
    for n in notes:
        n.thread_id = threads.get(n.id)


def _own_note(note_id: uuid.UUID, db: Session, user: User) -> Note:
    note = db.get(Note, note_id, options=[joinedload(Note.passage)])
    if note is None or note.user_id != user.id:
        raise HTTPException(404, "Note not found")
    return note


@router.post("", response_model=NoteOut, status_code=201)
def create_note(
    body: NoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    if body.passage_id is not None and db.get(Passage, body.passage_id) is None:
        raise HTTPException(404, "Passage not found")
    note = Note(user_id=user.id, passage_id=body.passage_id, content=body.content)
    _embed_note(note)
    db.add(note)
    db.commit()
    db.refresh(note)
    note.thread_id = None
    return note


@router.get("", response_model=list[NoteOut])
def list_notes(
    passage_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """All of the user's notes, newest first; or just those on one passage."""
    query = (
        select(Note)
        .options(joinedload(Note.passage))
        .where(Note.user_id == user.id)
        .order_by(Note.created_at.desc())
    )
    if passage_id is not None:
        query = query.where(Note.passage_id == passage_id)
    notes = list(db.scalars(query).all())
    _stamp_thread_ids(db, notes)
    return notes


@router.patch("/{note_id}", response_model=NoteOut)
def update_note(
    note_id: uuid.UUID,
    body: NoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    note = _own_note(note_id, db, user)
    note.content = body.content
    _embed_note(note)
    db.commit()
    db.refresh(note)
    _stamp_thread_ids(db, [note])
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(
    note_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    note = _own_note(note_id, db, user)
    db.delete(note)
    db.commit()
