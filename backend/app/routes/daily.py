"""The daily passage — the landing page's data. Public. Reading any
available tradition's passage of the day is open to everyone; the default
keeps existing clients on Stoicism unchanged."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.schemas.daily import DailyOut
from app.schemas.passage import PassageOut
from app.schemas.tradition import Tradition
from app.services import daily as daily_service

router = APIRouter(prefix="/api/daily", tags=["daily"])


@router.get("", response_model=DailyOut)
def today(tradition: Tradition = "stoicism", db: Session = Depends(get_db)):
    daily, breakdown = daily_service.get_today(db, tradition)
    return DailyOut(
        date=daily.date,
        passage=PassageOut.model_validate(daily.passage),
        breakdown=breakdown,
    )
