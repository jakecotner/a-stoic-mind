"""Chat routes (optional module — mirrors services/chat.py; delete together).
Thin by design: parse, call the service, shape the response."""
import uuid

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import current_active_user
from app.core.db import get_db
from app.core.ratelimit import MissCap
from app.crud import conversation as conversation_crud
from app.models import User
from app.schemas.chat import (
    ChatRequest,
    ConversationOut,
    ConversationSummary,
    ConversationUpdate,
    NarrateRequest,
)
from app.services import chat as chat_service

router = APIRouter(prefix="/api", tags=["chat"])

# Reply narration is never cached server-side, so every request is a paid
# synthesis. Sized for live conversation: a chatty hour is a few hundred
# sentences; a scripted crawl is not.
_narrate_cap = MissCap(limit=600, window_seconds=3600.0, what="narration")


@router.post("/chat")
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> StreamingResponse:
    conversation_id, history, context, tradition = chat_service.prepare_turn(
        db, req, user
    )
    return StreamingResponse(
        chat_service.stream_turn(
            conversation_id, history, req.message, context, user.id, tradition
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


@router.get("/messages/{message_id}/audio")
def message_audio(
    message_id: uuid.UUID,
    request: Request,
    voice: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> StreamingResponse:
    _narrate_cap.check(request)
    frames = chat_service.narrate_message(db, message_id, user, voice)
    # Streamed so playback starts on the first frames of a long reply.
    # Replies are immutable once written; a day of private caching covers
    # replaying one within a session without re-synthesizing.
    return StreamingResponse(
        frames,
        media_type="audio/mpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.post("/chat/narrate")
def narrate(
    req: NarrateRequest,
    request: Request,
    user: User = Depends(current_active_user),
) -> StreamingResponse:
    """Speak one sentence of a reply that's still streaming (live mode)."""
    _narrate_cap.check(request)
    frames = chat_service.narrate_snippet(user, req.text, req.voice)
    # Never cached: the same sentence won't be asked for twice.
    return StreamingResponse(frames, media_type="audio/mpeg")


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    chat_service.delete_owned_conversation(db, conversation_id, user)
