"""Practice routes. Authed — the calendar, intention, and sessions are
personal. The guide list alone is public: it is static content."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import current_active_user
from app.core.db import get_db
from app.models import User
from app.schemas.practice import (
    CalendarDayOut,
    DayDetailOut,
    GuideOut,
    IntentionIn,
    IntentionOut,
    SessionEndIn,
    SessionOut,
    SessionStartIn,
)
from app.services import practice as practice_service

router = APIRouter(prefix="/api/practice", tags=["practice"])


@router.get("/guides", response_model=list[GuideOut])
def list_guides():
    return practice_service.list_guides()


@router.post("/sessions", response_model=SessionOut)
def start_session(
    req: SessionStartIn,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return practice_service.start_session(db, user, req.guide)


@router.post("/sessions/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: uuid.UUID,
    req: SessionEndIn,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return practice_service.end_session(db, user, session_id, req.steps_completed)


@router.get("/calendar", response_model=list[CalendarDayOut])
def month_view(
    year: int,
    month: int,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return practice_service.month_view(db, user, year, month)


@router.get("/day", response_model=DayDetailOut)
def day_detail(
    on: date,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return practice_service.day_detail(db, user, on)


@router.get("/intention", response_model=IntentionOut | None)
def get_intention(
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return practice_service.get_intention(db, user)


@router.put("/intention", response_model=IntentionOut)
def set_intention(
    req: IntentionIn,
    user: User = Depends(current_active_user),
    db: Session = Depends(get_db),
):
    return practice_service.set_intention(db, user, req.minutes_per_day, req.time_of_day)
