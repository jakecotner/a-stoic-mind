"""Chat routes (optional module — mirrors services/chat.py; delete together).
Thin by design: parse, call the service, shape the response."""
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import current_active_user, current_user_optional
from app.core.db import get_db
from app.crud import conversation as conversation_crud
from app.models import User
from app.schemas.chat import ChatRequest, ConversationOut, ConversationSummary
from app.services import chat as chat_service

router = APIRouter(prefix="/api", tags=["chat"])


@router.post("/chat")
def chat(
    req: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(current_user_optional),
) -> StreamingResponse:
    conversation_id, history = chat_service.prepare_turn(db, req, request, user)
    return StreamingResponse(
        chat_service.stream_turn(
            conversation_id, history, req.message, user.id if user else None
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
    user: User | None = Depends(current_user_optional),
):
    return chat_service.get_visible_conversation(db, conversation_id, user)


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    chat_service.delete_owned_conversation(db, conversation_id, user)
