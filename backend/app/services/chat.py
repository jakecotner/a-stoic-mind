"""Chat business logic (optional module — mirrors routes/chat.py and the
chat models/schemas; delete together if the project isn't conversational).

The mentor always sees today's passage; it sees recent journal entries only
in conversations where the user flipped `share_journal` on (an explicit,
per-conversation choice — see models/conversation.py).

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
from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.auth import ensure_verified
from app.core.config import get_settings
from app.core.db import SessionLocal
from app.crud import conversation as conversation_crud
from app.crud import journal as journal_crud
from app.models import Conversation, Message, User
from app.schemas.chat import ChatRequest
from app.services import audio as audio_service
from app.services import daily as daily_service
from app.services import llm
from app.services.usage import enforce_turn_cap, record_usage

logger = logging.getLogger("astoicmind")

# How much journal rides along when sharing is on: the newest entries,
# oldest-first, each clipped so one long entry can't crowd out the rest.
JOURNAL_CONTEXT_ENTRIES = 10
JOURNAL_ENTRY_CLIP = 1000


def visible_to(conversation: Conversation, user: User | None) -> bool:
    """Owned conversations are visible only to their owner; non-owners get a
    404 so ids aren't confirmed to exist. (user_id NULL rows can exist only
    as leftovers of a deleted account — nobody can see them.)"""
    return (
        user is not None
        and conversation.user_id is not None
        and conversation.user_id == user.id
    )


def _build_context(db: Session, conversation: Conversation, user: User | None) -> str:
    """The volatile context for this turn: today's passage always, journal
    excerpts only with per-conversation consent."""
    parts: list[str] = []
    # The conversation's tradition, not the user's current one — an old
    # thread keeps seeing its own tradition's passage of the day.
    daily_row = daily_service.get_or_assign(
        db, date.today(), conversation.tradition
    )
    p = daily_row.passage
    parts.append(
        f"Today's passage — {p.reference} ({p.author}, {p.work}):\n\n{p.text}"
    )
    if user is not None and conversation.share_journal:
        entries = journal_crud.recent_for_user(
            db, user.id, limit=JOURNAL_CONTEXT_ENTRIES
        )
        if entries:
            lines = [
                f"[{e.date.isoformat()}] {e.content[:JOURNAL_ENTRY_CLIP]}"
                for e in entries
            ]
            parts.append(
                "Recent journal entries (the person chose to share these "
                "with you):\n\n" + "\n\n".join(lines)
            )
    return "\n\n---\n\n".join(parts)


def prepare_turn(
    db: Session, req: ChatRequest, user: User
) -> tuple[uuid.UUID, list[Message], str, str]:
    """Everything that happens BEFORE streaming: cap check, conversation
    resolution, history load, context assembly, user-message persist. Closes
    the request session on the way out — the stream must not hold a pool
    connection.

    Signed-in only: the original module's anonymous per-IP taste allowance
    was removed with its metering machinery, and unmetered anonymous LLM
    turns would be an open cost hole. Reinstate per-IP metering first if
    anonymous chat ever comes back.
    """
    ensure_verified(user)
    enforce_turn_cap(db, user)

    if req.conversation_id:
        conversation = conversation_crud.get(db, req.conversation_id)
        if conversation is None or not visible_to(conversation, user):
            raise HTTPException(404, "Conversation not found")
    else:
        conversation = conversation_crud.create(
            db,
            title=req.message[:80],
            user_id=user.id,
            share_journal=req.share_journal,
            # New threads start in the user's home tradition and keep it.
            tradition=user.tradition,
        )

    history = conversation_crud.recent_messages(
        db, conversation.id, get_settings().history_max_messages
    )
    context = _build_context(db, conversation, user)
    conversation_crud.add_message(db, conversation.id, "user", req.message)

    conversation_id = conversation.id
    tradition = conversation.tradition
    # Everything the stream needs is loaded; release the request session now.
    # Detached history is fine: only already-loaded column attributes are
    # read past this point.
    db.close()
    return conversation_id, history, context, tradition


def stream_turn(
    conversation_id: uuid.UUID,
    history: list[Message],
    user_message: str,
    context: str,
    user_id: uuid.UUID | None,
    tradition: str,
) -> Iterator[str]:
    """The SSE event generator. Runs after the request session is closed."""
    meta = {"conversation_id": str(conversation_id)}
    yield f"event: meta\ndata: {json.dumps(meta)}\n\n"

    chunks: list[str] = []
    final = None
    try:
        for item in llm.stream_reply(
            history, user_message, context, tradition=tradition
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
        record_usage("chat", final, user_id=user_id)
    if final is not None and final.stop_reason == "refusal":
        note = "I can't help with that request."
        reply = reply or note
        yield f"data: {json.dumps(note)}\n\n"

    # Fresh session for the final write — robust to client disconnects
    # mid-stream, and the request session is already closed anyway. The done
    # event carries the persisted assistant message's id so the client can
    # ask for its narration (live mode) without refetching the thread.
    done: dict = {}
    if reply:
        with SessionLocal() as write_db:
            message = conversation_crud.add_message(
                write_db, conversation_id, "assistant", reply
            )
            done["message_id"] = str(message.id)

    yield f"event: done\ndata: {json.dumps(done)}\n\n"


def get_visible_conversation(
    db: Session, conversation_id: uuid.UUID, user: User | None
) -> Conversation:
    conversation = conversation_crud.get(db, conversation_id)
    if conversation is None or not visible_to(conversation, user):
        raise HTTPException(404, "Conversation not found")
    return conversation


def _get_owned_conversation(
    db: Session, conversation_id: uuid.UUID, user: User
) -> Conversation:
    conversation = conversation_crud.get(db, conversation_id)
    if (
        conversation is None
        or conversation.user_id is None
        or conversation.user_id != user.id
    ):
        raise HTTPException(404, "Conversation not found")
    return conversation


def set_share_journal(
    db: Session, conversation_id: uuid.UUID, user: User, share_journal: bool
) -> Conversation:
    """The per-conversation journal-sharing switch. Owner only — anonymous
    conversations have no journal to share (they 404 here)."""
    conversation = _get_owned_conversation(db, conversation_id, user)
    return conversation_crud.set_share_journal(db, conversation, share_journal)


def delete_owned_conversation(
    db: Session, conversation_id: uuid.UUID, user: User
) -> None:
    conversation = _get_owned_conversation(db, conversation_id, user)
    conversation_crud.delete(db, conversation)


def narrate_message(
    db: Session, message_id: uuid.UUID, user: User, voice: str
) -> Iterator[bytes]:
    """Speak one of the mentor's replies (the listen button).

    Owner-only, assistant messages only. Unlike passage narration this is
    NOT cached in the DB — replies are one-off and replays are rare; the
    route's private cache header covers the replay-in-a-tab case. Streamed
    so playback starts on the first synthesized frames instead of after the
    whole reply is voiced."""
    message = conversation_crud.get_message(db, message_id)
    if message is None:
        raise HTTPException(404, "Message not found")
    conversation = conversation_crud.get(db, message.conversation_id)
    if conversation is None or not visible_to(conversation, user):
        raise HTTPException(404, "Message not found")
    if message.role != "assistant":
        raise HTTPException(404, "Nothing to narrate")
    text = audio_service.strip_markdown(message.content)
    voice = audio_service.resolve_voice(voice)
    return audio_service.synthesize_stream(
        text, voice, instructions=audio_service.MENTOR_INSTRUCTIONS
    )


# Live mode sends one sentence at a time; anything longer than this isn't a
# sentence and is refused rather than synthesized on someone's dime.
NARRATE_SNIPPET_MAX = 1500


def narrate_snippet(user: User, text: str, voice: str) -> Iterator[bytes]:
    """Speak a fragment of a reply that's still streaming (live mode's
    sentence-by-sentence pipeline). The text isn't persisted yet, so unlike
    narrate_message there's nothing to look up — verified members only, with
    a hard length cap; the route adds a per-IP rate cap."""
    ensure_verified(user)
    text = audio_service.strip_markdown(text)
    if not text:
        raise HTTPException(422, "Nothing to narrate")
    if len(text) > NARRATE_SNIPPET_MAX:
        raise HTTPException(422, "Snippet too long")
    voice = audio_service.resolve_voice(voice)
    return audio_service.synthesize_stream(
        text, voice, instructions=audio_service.MENTOR_INSTRUCTIONS
    )
