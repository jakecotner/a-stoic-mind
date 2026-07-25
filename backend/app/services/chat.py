"""Chat business logic (optional module — mirrors routes/chat.py and the
chat models/schemas; delete together if the project isn't conversational).

The SSE contract, hard-won in production:
- an initial `meta` event carries the conversation id (and any extra context);
- text deltas stream as plain `data:` events;
- an exception mid-stream becomes an `error` EVENT — raising would just sever
  the connection with no explanation for the client;
- a model refusal is surfaced as a normal text note;
- the request-scoped session is released BEFORE streaming starts (see
  prepare_turn) so it doesn't hold a pool connection for the whole reply, and
  the final assistant-message write opens its own fresh session (robust to
  client disconnects mid-stream).
"""
import json
import logging
import uuid
from collections.abc import Iterator

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from app.core.auth import ensure_verified
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.crud import conversation as conversation_crud
from app.models import Conversation, Message, User
from app.schemas.chat import ChatRequest
from app.services import llm
from app.services.usage import METERED_KIND, enforce_turn_cap, record_usage

logger = logging.getLogger("astoicmind")


def visible_to(conversation: Conversation, user: User | None) -> bool:
    """Anonymous conversations (user_id NULL) are visible to whoever holds the
    id; owned conversations only to their owner. Non-owners get a 404 so ids
    aren't confirmed to exist."""
    if conversation.user_id is None:
        return True
    return user is not None and conversation.user_id == user.id


def prepare_turn(
    db: Session, req: ChatRequest, request: Request, user: User | None
) -> tuple[uuid.UUID, list[Message]]:
    """Everything that happens BEFORE streaming: cap check, conversation
    resolution, history load, user-message persist. Closes the request
    session on the way out — the stream must not hold a pool connection."""
    ensure_verified(user)
    enforce_turn_cap(db, user, request)

    if req.conversation_id:
        conversation = conversation_crud.get(db, req.conversation_id)
        if conversation is None or not visible_to(conversation, user):
            raise HTTPException(404, "Conversation not found")
    else:
        conversation = conversation_crud.create(
            db, title=req.message[:80], user_id=user.id if user else None
        )

    history = conversation_crud.recent_messages(
        db, conversation.id, get_settings().history_max_messages
    )
    conversation_crud.add_message(db, conversation.id, "user", req.message)

    conversation_id = conversation.id
    # Everything the stream needs is loaded; release the request session now.
    # Detached history is fine: only already-loaded column attributes are
    # read past this point.
    db.close()
    return conversation_id, history


def stream_turn(
    conversation_id: uuid.UUID,
    history: list[Message],
    user_message: str,
    user_id: uuid.UUID | None,
) -> Iterator[str]:
    """The SSE event generator. Runs after the request session is closed."""
    meta = {"conversation_id": str(conversation_id)}
    yield f"event: meta\ndata: {json.dumps(meta)}\n\n"

    chunks: list[str] = []
    final = None
    try:
        for item in llm.stream_reply(history, user_message):
            if isinstance(item, str):
                chunks.append(item)
                yield f"data: {json.dumps(item)}\n\n"
            else:
                final = item
    except Exception as exc:  # surface as an SSE event; a raise here would
        # just sever the connection with no explanation for the client
        logger.exception("chat stream failed")
        detail = {"error": f"{type(exc).__name__}: {exc}"}
        yield f"event: error\ndata: {json.dumps(detail)}\n\n"

    reply = "".join(chunks)
    if final is not None:
        record_usage(METERED_KIND, final, user_id=user_id)
    if final is not None and final.stop_reason == "refusal":
        note = "I can't help with that request."
        reply = reply or note
        yield f"data: {json.dumps(note)}\n\n"

    # Fresh session for the final write — robust to client disconnects
    # mid-stream, and the request session is already closed anyway.
    if reply:
        with SessionLocal() as write_db:
            conversation_crud.add_message(
                write_db, conversation_id, "assistant", reply
            )

    yield "event: done\ndata: {}\n\n"


def get_visible_conversation(
    db: Session, conversation_id: uuid.UUID, user: User | None
) -> Conversation:
    conversation = conversation_crud.get(db, conversation_id)
    if conversation is None or not visible_to(conversation, user):
        raise HTTPException(404, "Conversation not found")
    return conversation


def delete_owned_conversation(
    db: Session, conversation_id: uuid.UUID, user: User
) -> None:
    conversation = conversation_crud.get(db, conversation_id)
    if (
        conversation is None
        or conversation.user_id is None
        or conversation.user_id != user.id
    ):
        raise HTTPException(404, "Conversation not found")
    conversation_crud.delete(db, conversation)
