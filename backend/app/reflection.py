"""LLM-written opening reflections on passages, seeding Stoa conversations.

One reflection per (passage, language), cached in-process. The corpus is 1,400
passages and readers cluster in a few languages, so the cache stays naturally
bounded; a restart just regenerates on demand. The daily passage is the common
case — its reflection is generated once per language for everyone.

For a non-English reader the reflection is written about the passage AS THEY
SEE IT — the prompt carries the cached translation (generated on the spot if
needed), so anything the reflection quotes matches the displayed text.
"""
import hashlib
import json
import logging
import threading
from collections.abc import Iterator

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.ratelimit import MissCap
from app.usage import record_usage
from app.models import Passage, ReflectionAudio
from app.schemas import PassageOut
from app.tts import resolve_voice, strip_markdown, synthesize
from app.translation import LANGUAGES, get_translation

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

# Keyed (passage_id, language); "" = English.
_cache: dict[tuple[int, str], str] = {}
_lock = threading.Lock()


def _passage_prompt(passage: Passage, language: str, shown_text: str) -> str:
    if language:
        return (
            f"Passage ({passage.author}, {passage.reference}), shown to the "
            f"reader in {LANGUAGES[language][0]}:\n\n{shown_text}\n\n"
            f"Write the reflection entirely in {LANGUAGES[language][0]}."
        )
    return (
        f"Passage ({passage.author}, {passage.reference}, "
        f"trans. {passage.translator}):\n\n{shown_text}"
    )


def _generate_stream(
    passage: Passage, language: str, shown_text: str
) -> Iterator[str]:
    """Yield reflection text deltas, caching the full text once complete."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    chunks: list[str] = []
    with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=2000,
        system=REFLECTION_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": _passage_prompt(passage, language, shown_text),
            }
        ],
    ) as stream:
        for text in stream.text_stream:
            chunks.append(text)
            yield text
        record_usage("passage_breakdown", stream.get_final_message())
    full = "".join(chunks)
    if full.strip():
        with _lock:
            _cache[(passage.id, language)] = full


def get_reflection(db: Session, passage: Passage, language: str = "") -> str:
    """Cached reflection, generating synchronously if needed (chat seeding)."""
    with _lock:
        cached = _cache.get((passage.id, language))
    if cached is not None:
        return cached
    shown = get_translation(db, passage, language)
    return "".join(_generate_stream(passage, language, shown))


def seed_message_content(db: Session, passage: Passage, language: str = "") -> str:
    """The self-contained first assistant message for a seeded conversation:
    the passage as a markdown quote (in the reader's language), then the
    reflection. Keeps reloaded conversations (and the model's own history)
    anchored to the passage."""
    shown = get_translation(db, passage, language)
    quote = "\n".join("> " + line for line in shown.splitlines())
    return (
        f"{quote}\n>\n> — {passage.author}, {passage.reference}\n\n"
        f"{get_reflection(db, passage, language)}"
    )


@router.get("/reflection/{passage_id}")
def reflection(
    passage_id: int, language: str = "", db: Session = Depends(get_db)
) -> StreamingResponse:
    """SSE stream of the reflection for a passage; instant when cached."""
    if language and language not in LANGUAGES:
        raise HTTPException(422, "Unsupported language code")
    passage = db.get(Passage, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")

    with _lock:
        cached = _cache.get((passage_id, language))
    # The displayed-text lookup may generate (and cache) the translation; the
    # common case is a hit, since the reader was just shown this passage.
    shown = "" if cached is not None else get_translation(db, passage, language)

    def event_stream() -> Iterator[str]:
        meta = {"passage": PassageOut.model_validate(passage).model_dump()}
        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"
        try:
            if cached is not None:
                yield f"data: {json.dumps(cached)}\n\n"
            else:
                for delta in _generate_stream(passage, language, shown):
                    yield f"data: {json.dumps(delta)}\n\n"
        except Exception as exc:
            logger.exception("reflection stream failed")
            yield f"event: error\ndata: {json.dumps({'error': f'{type(exc).__name__}: {exc}'})}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


_audio_miss_cap = MissCap(limit=30, window_seconds=3600.0, what="narration")


@router.get("/reflection/{passage_id}/audio")
def reflection_audio(
    passage_id: int,
    request: Request,
    language: str = "",
    voice: str = "",
    db: Session = Depends(get_db),
) -> Response:
    """Narration of the passage's breakdown. Cached like passage audio, but a
    reflection is regenerated after a server restart, so the cached row is
    keyed to the hash of the text it narrates and replaced on mismatch. Hence
    also the modest cache lifetime, where passage audio is immutable."""
    if language and language not in LANGUAGES:
        raise HTTPException(422, "Unsupported language code")
    passage = db.get(Passage, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")

    speech_text = strip_markdown(get_reflection(db, passage, language))
    text_hash = hashlib.sha256(speech_text.encode()).hexdigest()
    voice = resolve_voice(voice)

    key = (passage_id, language, voice)
    row = db.get(ReflectionAudio, key)
    if row is None or row.text_hash != text_hash:
        _audio_miss_cap.check(request)
        data, media_type = synthesize(speech_text, voice)
        if row is None:
            row = ReflectionAudio(
                passage_id=passage_id,
                language=language,
                voice=voice,
                text_hash=text_hash,
                media_type=media_type,
                data=data,
            )
            db.add(row)
        else:
            row.text_hash = text_hash
            row.media_type = media_type
            row.data = data
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request inserted the same row first; theirs won.
            db.rollback()
            row = db.get(ReflectionAudio, key)
            if row is None:  # pragma: no cover — commit raced then vanished
                raise HTTPException(500, "Audio cache write failed")
    return Response(
        content=row.data,
        media_type=row.media_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )
