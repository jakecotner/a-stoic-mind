import datetime
import json
import uuid
import logging
from collections.abc import Iterator
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.orm import Session

from app import llm
from app.auth import (
    auth_backend,
    bearer_backend,
    current_active_user,
    current_user_optional,
    fastapi_users,
)
from app.config import get_settings
from app.db import SessionLocal, get_db
from app.models import Conversation, Message, Note, Passage, User
from app.admin import router as admin_router
from app.billing import router as billing_router
from app.conversations import router as conversations_router
from app.journal import router as journal_router
from app.practice import router as practice_router
from app.reading import router as reading_router
from app.reflection import router as reflection_router, seed_message_content
from app.related import router as related_router
from app.synthesis import router as synthesis_router
from app.translation import LANGUAGES, router as translation_router
from app.retrieval import search_passages
from app.usage import enforce_reflection_cap, record_usage, require_plus
from app.schemas import (
    ChatRequest,
    ConversationOut,
    LanguageUpdate,
    PassageOut,
    UserCreate,
    UserRead,
)

logger = logging.getLogger("stoa")

app = FastAPI(title="A Stoic Mind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,  # auth cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth: JWT in an httponly cookie for the web app, bearer token for the
# mobile app (see app/auth.py).
app.include_router(
    fastapi_users.get_auth_router(auth_backend), prefix="/api/auth", tags=["auth"]
)
app.include_router(
    fastapi_users.get_auth_router(bearer_backend),
    prefix="/api/auth/bearer",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix="/api/auth",
    tags=["auth"],
)
app.include_router(reading_router)
app.include_router(journal_router)
app.include_router(practice_router)
app.include_router(conversations_router)
app.include_router(admin_router)
app.include_router(billing_router)
app.include_router(reflection_router)
app.include_router(related_router)
app.include_router(synthesis_router)
app.include_router(translation_router)
# Hook points for when email sending is set up (templates in fastapi-users docs):
# app.include_router(fastapi_users.get_verify_router(UserRead), prefix="/api/auth", tags=["auth"])
# app.include_router(fastapi_users.get_reset_password_router(), prefix="/api/auth", tags=["auth"])


@app.get("/api/auth/me", response_model=UserRead)
def me(user: User = Depends(current_active_user)):
    return user


@app.put("/api/me/language", status_code=204)
def set_language(
    req: LanguageUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    """Account-level reading language; "" clears back to the published English."""
    if req.language and req.language not in LANGUAGES:
        raise HTTPException(422, "Unsupported language code")
    row = db.get(User, user.id)
    row.language = req.language or None
    db.commit()


@app.delete("/api/auth/me", status_code=204)
def delete_me(
    db: Session = Depends(get_db), user: User = Depends(current_active_user)
):
    """Self-service account deletion (App Store guideline 5.1.1(v)).

    Deleting the user cascades notes → their anchored reflection threads →
    messages, plus passage_reads and the practice plan. Conversations are
    deleted explicitly first: their user_id FK is SET NULL, which would
    otherwise leave the user's non-anchored chat history orphaned but intact.
    """
    db.execute(sa_delete(Conversation).where(Conversation.user_id == user.id))
    row = db.get(User, user.id)
    if row is not None:
        db.delete(row)
    db.commit()


def _conversation_visible(conversation: Conversation, user: User | None) -> bool:
    """Anonymous conversations (user_id NULL) are visible to whoever holds the
    id; owned conversations only to their owner. Non-owners get a 404 so ids
    aren't confirmed to exist."""
    if conversation.user_id is None:
        return True
    return user is not None and conversation.user_id == user.id


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/chat")
def chat(
    req: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User | None = Depends(current_user_optional),
) -> StreamingResponse:
    settings = get_settings()
    enforce_reflection_cap(db, user, request)
    if req.language and req.language not in LANGUAGES:
        raise HTTPException(422, "Unsupported language code")

    if req.conversation_id:
        conversation = db.get(Conversation, req.conversation_id)
        if conversation is None or not _conversation_visible(conversation, user):
            raise HTTPException(404, "Conversation not found")
    else:
        # A thread under a journal entry: only the entry's owner may start it,
        # and an entry has at most one thread.
        note = None
        if req.note_id is not None:
            note = db.get(Note, req.note_id)
            if note is None or user is None or note.user_id != user.id:
                raise HTTPException(404, "Note not found")
            existing = db.scalar(
                select(Conversation).where(Conversation.note_id == note.id)
            )
            if existing is not None:
                raise HTTPException(409, "Entry already has a reflection thread")
        # A discussion thread on a passage in the reading pane: Plus-only
        # (MONETIZATION.md slice 4), one per (user, passage).
        anchor_passage = None
        if req.passage_id is not None:
            if user is None:
                raise HTTPException(401, "Sign in to discuss passages")
            require_plus(user, "Passage discussions are part of Stoa Plus.")
            anchor_passage = db.get(Passage, req.passage_id)
            if anchor_passage is None:
                raise HTTPException(404, "Passage not found")
            existing = db.scalar(
                select(Conversation).where(
                    Conversation.user_id == user.id,
                    Conversation.passage_id == anchor_passage.id,
                )
            )
            if existing is not None:
                raise HTTPException(409, "Passage already has a discussion thread")
        conversation = Conversation(
            title=req.message[:80],
            user_id=user.id if user else None,
            note_id=note.id if note else None,
            passage_id=anchor_passage.id if anchor_passage else None,
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
        # Seed the fresh conversation with the passage + reflection the user
        # was shown, so it's real history (for the model and for reloads).
        # A passage-anchored thread seeds with its own passage by default.
        seed_id = req.seed_passage_id
        if seed_id is None and anchor_passage is not None:
            seed_id = anchor_passage.id
        if seed_id is not None:
            seed_passage = db.get(Passage, seed_id)
            if seed_passage is not None:
                db.add(
                    Message(
                        conversation_id=conversation.id,
                        role="assistant",
                        content=seed_message_content(db, seed_passage, req.language),
                    )
                )
                db.commit()

    history = list(
        db.scalars(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at.desc())
            .limit(settings.history_max_messages)
        )
    )[::-1]

    passages = search_passages(db, req.message)

    db.add(Message(conversation_id=conversation.id, role="user", content=req.message))
    db.commit()

    conversation_id = conversation.id
    user_id = user.id if user else None
    sources = [PassageOut.model_validate(p).model_dump() for p in passages]

    def event_stream() -> Iterator[str]:
        meta = {"conversation_id": str(conversation_id), "sources": sources}
        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"

        chunks: list[str] = []
        final = None
        try:
            for item in llm.stream_reply(
                history, req.message, passages, req.language
            ):
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
            record_usage("reflection_turn", final, user_id=user_id)
        if final is not None and final.stop_reason == "refusal":
            note = "I can't help with that request."
            reply = reply or note
            yield f"data: {json.dumps(note)}\n\n"

        # The request-scoped session is still open while we stream, but use a
        # fresh one here to be robust to client disconnects mid-stream.
        if reply:
            with SessionLocal() as write_db:
                write_db.add(
                    Message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=reply,
                    )
                )
                write_db.commit()

        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(
    conversation_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User | None = Depends(current_user_optional),
):
    conversation = db.get(Conversation, conversation_id)
    if conversation is None or not _conversation_visible(conversation, user):
        raise HTTPException(404, "Conversation not found")
    return conversation


@app.get("/api/passages/{passage_id}/thread")
def passage_thread(
    passage_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
) -> dict:
    """The signed-in user's discussion thread on a passage, if one exists —
    lets the reading pane offer 'continue' instead of 'start'."""
    conversation = db.scalar(
        select(Conversation).where(
            Conversation.user_id == user.id,
            Conversation.passage_id == passage_id,
        )
    )
    if conversation is None:
        raise HTTPException(404, "No discussion for this passage")
    return {"conversation_id": str(conversation.id)}


@app.get("/api/passages/{passage_id}", response_model=PassageOut)
def get_passage(passage_id: int, db: Session = Depends(get_db)):
    passage = db.get(Passage, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")
    return passage


@app.get("/api/daily", response_model=PassageOut)
def daily_passage(db: Session = Depends(get_db)):
    """Deterministic passage of the day."""
    count = db.scalar(select(func.count()).select_from(Passage))
    if not count:
        raise HTTPException(404, "No passages ingested yet")
    day = datetime.date.today().toordinal()
    offset = day % count
    passage = db.scalars(
        select(Passage).order_by(Passage.id).offset(offset).limit(1)
    ).first()
    return passage


# Production: serve the built frontend from this same origin. Mounted last so
# the /api routes above take precedence.
_static_dir = get_settings().static_dir
if _static_dir and Path(_static_dir).is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
