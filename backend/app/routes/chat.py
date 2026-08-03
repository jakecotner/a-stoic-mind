"""Chat routes (optional module — mirrors services/chat.py; delete together).
Thin by design: parse, call the service, shape the response."""
import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import current_active_user
from app.core.db import get_db
from app.crud import conversation as conversation_crud
from app.models import User
from app.schemas.chat import (
    ChatRequest,
    ConversationOut,
    ConversationSummary,
    ConversationUpdate,
)
from app.services import chat as chat_service

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat")
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> StreamingResponse:
    conversation_id, history, context = chat_service.prepare_turn(db, req, user)
    return StreamingResponse(
        chat_service.stream_turn(
            conversation_id, history, req.message, context, user.id
        ),
        media_type="text/event-stream",
    )


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations(
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    return conversation_crud.list_for_user(db, user.id)


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    return chat_service.get_visible_conversation(db, conversation_id, user)


@router.patch("/conversations/{conversation_id}", response_model=ConversationSummary)
def update_conversation(
    conversation_id: uuid.UUID,
    req: ConversationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    return chat_service.set_share_journal(
        db, conversation_id, user, req.share_journal
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    chat_service.delete_owned_conversation(db, conversation_id, user)
