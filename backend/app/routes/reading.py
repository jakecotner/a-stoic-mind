"""Reader routes: TOC (public), margin notes and reads (authed, private)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import current_active_user
from app.core.db import get_db
from app.crud import reading as reading_crud
from app.models import User
from app.schemas.reading import (
    MarkReadIn,
    MarkReadOut,
    NoteCreate,
    NoteOut,
    NoteUpdate,
    TocPartOut,
)
from app.services import reading as reading_service

router = APIRouter(prefix="/api", tags=["reading"])


@router.get("/works/toc", response_model=list[TocPartOut])
def work_toc(work: str, db: Session = Depends(get_db)):
    return reading_service.toc(db, work)


@router.get("/notes", response_model=list[NoteOut])
def list_notes(
    passage_id: uuid.UUID | None = None,
    work: str | None = None,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    """Margin notes for one passage, or all of the caller's notes in a work
    (the reader fetches per-work so each page is one request)."""
    if passage_id is not None:
        return reading_crud.notes_for_passage(db, user.id, passage_id)
    if work is not None:
        return reading_crud.notes_for_work(db, user.id, work)
    raise HTTPException(422, "Provide passage_id or work")


@router.post("/notes", response_model=NoteOut)
def create_note(
    req: NoteCreate,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return reading_service.create_note(db, user, req.passage_id, req.content)


@router.patch("/notes/{note_id}", response_model=NoteOut)
def update_note(
    note_id: uuid.UUID,
    req: NoteUpdate,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return reading_service.update_note(db, user, note_id, req.content)


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(
    note_id: uuid.UUID,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    reading_service.delete_note(db, user, note_id)


@router.get("/reads", response_model=list[uuid.UUID])
def read_passage_ids(
    work: str,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return reading_crud.read_passage_ids_for_work(db, user.id, work)


@router.post("/reads", response_model=MarkReadOut)
def mark_read(
    req: MarkReadIn,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return MarkReadOut(marked=reading_service.mark_read(db, user, req.work, req.part))
