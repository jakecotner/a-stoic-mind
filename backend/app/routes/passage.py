"""Corpus routes. Public — the library is the product's front door, and the
texts are public domain. Trivial reads call crud directly; the breakdown
goes through its service (first view generates and caches)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.crud import passage as passage_crud
from app.schemas.passage import BreakdownOut, PassageOut, WorkOut
from app.services import reading as reading_service
from app.services.breakdown import breakdown_for

router = APIRouter(prefix="/api", tags=["corpus"])


@router.get("/works", response_model=list[WorkOut])
def list_works(db: Session = Depends(get_db)):
    return [WorkOut.model_validate(row, from_attributes=True) for row in passage_crud.list_works(db)]


@router.get("/passages", response_model=list[PassageOut])
def passages_for_work(
    work: str, part: str | None = None, db: Session = Depends(get_db)
):
    """A work's passages in reading order; `part` narrows to one reading
    unit (a book, letter, or chapter — see /api/works/toc)."""
    if part is not None:
        return reading_service.passages_for_part(db, work, part)
    passages = passage_crud.for_work(db, work)
    if not passages:
        raise HTTPException(404, "No such work")
    return passages


@router.get("/passages/{passage_id}", response_model=PassageOut)
def get_passage(passage_id: uuid.UUID, db: Session = Depends(get_db)):
    passage = passage_crud.get(db, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")
    return passage


@router.get("/passages/{passage_id}/breakdown", response_model=BreakdownOut)
def get_breakdown(passage_id: uuid.UUID, db: Session = Depends(get_db)):
    """The passage's breakdown — cached after the first view, so the first
    request may take several seconds while it's written."""
    passage = passage_crud.get(db, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")
    return BreakdownOut(
        passage_id=passage.id, breakdown=breakdown_for(db, passage, "en")
    )
