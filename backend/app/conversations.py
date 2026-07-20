"""Conversation listing for sidebar navigation.

Anonymous conversations (user_id NULL) are reachable only by id, so the list
requires auth and returns only the signed-in user's conversations.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import current_active_user
from app.db import get_db
from app.models import Conversation, User
from app.schemas import ConversationSummary

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationSummary])
def list_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    return db.scalars(
        select(Conversation)
        .where(Conversation.user_id == user.id)
        .order_by(Conversation.created_at.desc())
    ).all()
