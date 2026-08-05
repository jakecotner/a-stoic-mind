"""Traditions: the public listing (the title dropdown's data) and the
signed-in user's home-tradition choice."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import current_active_user
from app.core.db import get_db
from app.models import User
from app.schemas.tradition import TraditionChoice, TraditionOut
from app.schemas.user import UserRead
from app.services import tradition as tradition_service

router = APIRouter(prefix="/api/traditions", tags=["traditions"])


@router.get("", response_model=list[TraditionOut])
def list_traditions():
    return tradition_service.list_traditions()


@router.put("/mine", response_model=UserRead)
def choose_tradition(
    req: TraditionChoice,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    return tradition_service.choose_tradition(db, user, req.tradition)
