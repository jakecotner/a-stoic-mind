import datetime
import json
import uuid
import logging
from collections.abc import Iterator
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import llm
from app.config import get_settings
from app.db import SessionLocal, get_db
from app.models import Conversation, Message, Passage
from app.retrieval import search_passages
from app.schemas import ChatRequest, ConversationOut, PassageOut

logger = logging.getLogger("stoa")

app = FastAPI(title="A Stoic Mind API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/chat")
def chat(req: ChatRequest, db: Session = Depends(get_db)) -> StreamingResponse:
    settings = get_settings()

    if req.conversation_id:
        conversation = db.get(Conversation, req.conversation_id)
        if conversation is None:
            raise HTTPException(404, "Conversation not found")
    else:
        conversation = Conversation(title=req.message[:80])
        db.add(conversation)
        db.commit()
        db.refresh(conversation)

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
    sources = [PassageOut.model_validate(p).model_dump() for p in passages]

    def event_stream() -> Iterator[str]:
        meta = {"conversation_id": str(conversation_id), "sources": sources}
        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"

        chunks: list[str] = []
        final = None
        try:
            for item in llm.stream_reply(history, req.message, passages):
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
def get_conversation(conversation_id: uuid.UUID, db: Session = Depends(get_db)):
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(404, "Conversation not found")
    return conversation


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
