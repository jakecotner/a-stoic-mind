"""LLM-written opening reflections on passages, seeding Stoa conversations.

One reflection per passage, cached in-process. The corpus is 1,400 passages so
the cache is naturally bounded; a restart just regenerates on demand. The daily
passage is the common case — its reflection is generated once for everyone.
"""
import json
import logging
import threading
from collections.abc import Iterator

import anthropic
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Passage
from app.schemas import PassageOut

logger = logging.getLogger("stoa")

router = APIRouter(prefix="/api", tags=["reflection"])

REFLECTION_SYSTEM = """\
You write the opening reflection for "A Stoic Mind", a reflective practice
grounded in Stoic philosophy. You are given a single passage from a primary
Stoic text. Your reflection opens a conversation about it in "the Stoa".

Write 2-3 short paragraphs that: unpack what the passage is saying in plain,
modern language; ground it in one concrete situation a person today would
recognize; and end with a single gentle question that invites the reader to
respond from their own life.

Rules: no headers, no lists. Quote only words that appear in the passage.
Keep it under 180 words. Warm and direct — you are opening a conversation,
not delivering a lecture. Do not greet the reader or introduce yourself;
begin with the substance.
"""

_cache: dict[int, str] = {}
_lock = threading.Lock()


def _passage_prompt(passage: Passage) -> str:
    return (
        f"Passage ({passage.author}, {passage.reference}, "
        f"trans. {passage.translator}):\n\n{passage.text}"
    )


def _generate_stream(passage: Passage) -> Iterator[str]:
    """Yield reflection text deltas, caching the full text once complete."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    chunks: list[str] = []
    with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=2000,
        system=REFLECTION_SYSTEM,
        messages=[{"role": "user", "content": _passage_prompt(passage)}],
    ) as stream:
        for text in stream.text_stream:
            chunks.append(text)
            yield text
    full = "".join(chunks)
    if full.strip():
        with _lock:
            _cache[passage.id] = full


def get_reflection(passage: Passage) -> str:
    """Cached reflection, generating synchronously if needed (chat seeding)."""
    with _lock:
        cached = _cache.get(passage.id)
    if cached is not None:
        return cached
    return "".join(_generate_stream(passage))


def seed_message_content(passage: Passage) -> str:
    """The self-contained first assistant message for a seeded conversation:
    the passage as a markdown quote, then the reflection. Keeps reloaded
    conversations (and the model's own history) anchored to the passage."""
    quote = "\n".join("> " + line for line in passage.text.splitlines())
    return (
        f"{quote}\n>\n> — {passage.author}, {passage.reference}\n\n"
        f"{get_reflection(passage)}"
    )


@router.get("/reflection/{passage_id}")
def reflection(passage_id: int, db: Session = Depends(get_db)) -> StreamingResponse:
    """SSE stream of the reflection for a passage; instant when cached."""
    passage = db.get(Passage, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")

    with _lock:
        cached = _cache.get(passage_id)

    def event_stream() -> Iterator[str]:
        meta = {"passage": PassageOut.model_validate(passage).model_dump()}
        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"
        try:
            if cached is not None:
                yield f"data: {json.dumps(cached)}\n\n"
            else:
                for delta in _generate_stream(passage):
                    yield f"data: {json.dumps(delta)}\n\n"
        except Exception as exc:
            logger.exception("reflection stream failed")
            yield f"event: error\ndata: {json.dumps({'error': f'{type(exc).__name__}: {exc}'})}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
