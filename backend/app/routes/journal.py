"""Journal routes. All authed — the journal is private by construction."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import current_active_user
from app.core.db import get_db
from app.crud import journal as journal_crud
from app.models import User
from app.schemas.journal import (
    JournalEntryCreate,
    JournalEntryOut,
    JournalEntryUpdate,
)
from app.services import journal as journal_service

router = APIRouter(prefix="/api/journal", tags=["journal"])


@router.post("", response_model=JournalEntryOut)
def create_entry(
    req: JournalEntryCreate,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return journal_service.create_entry(db, user, req.content, req.passage_id)


@router.get("", response_model=list[JournalEntryOut])
def list_entries(
    on: date | None = None,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return journal_crud.for_user_on(db, user.id, on if on is not None else date.today())


@router.patch("/{entry_id}", response_model=JournalEntryOut)
def update_entry(
    entry_id: uuid.UUID,
    req: JournalEntryUpdate,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return journal_service.update_entry(db, user, entry_id, req.content)


@router.delete("/{entry_id}", status_code=204)
def delete_entry(
    entry_id: uuid.UUID,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    journal_service.delete_entry(db, user, entry_id)
