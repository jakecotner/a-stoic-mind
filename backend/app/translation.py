"""On-demand LLM translation of passages, cached per (passage, language).

Same economics as passage audio: the corpus is immutable, so each pair is
translated once on first request and cached forever — total spend is bounded
at "whole corpus × languages actually read". Cached in the DB (not in-process
like reflections) because translations stand in for the passage text itself
and should survive restarts.

Passages with an ingested original (Greek/Latin, see Passage.original_text)
are translated from the original with the public-domain English as a
reference check; passages without one are translated from the English alone.
"""
import json
import logging
from collections.abc import Iterator

import anthropic
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import SessionLocal, get_db
from app.usage import record_usage
from app.models import Passage, PassageTranslation
from app.ratelimit import MissCap
from app.schemas import LanguageOut

logger = logging.getLogger("stoa")

router = APIRouter(prefix="/api", tags=["translation"])

# code -> (English name for the prompt, native label for the picker)
LANGUAGES: dict[str, tuple[str, str]] = {
    # A fresh modern English rendering — from the original where ingested,
    # otherwise a modernization of the public-domain translation.
    "en": ("English", "English (modern)"),
    "ar": ("Arabic", "العربية"),
    "bn": ("Bengali", "বাংলা"),
    "cs": ("Czech", "Čeština"),
    "da": ("Danish", "Dansk"),
    "de": ("German", "Deutsch"),
    "el": ("Greek", "Ελληνικά"),
    "es": ("Spanish", "Español"),
    "fi": ("Finnish", "Suomi"),
    "fr": ("French", "Français"),
    "he": ("Hebrew", "עברית"),
    "hi": ("Hindi", "हिन्दी"),
    "hu": ("Hungarian", "Magyar"),
    "id": ("Indonesian", "Bahasa Indonesia"),
    "it": ("Italian", "Italiano"),
    "ja": ("Japanese", "日本語"),
    "ko": ("Korean", "한국어"),
    "nl": ("Dutch", "Nederlands"),
    "no": ("Norwegian", "Norsk"),
    "pl": ("Polish", "Polski"),
    "pt": ("Portuguese", "Português"),
    "ro": ("Romanian", "Română"),
    "ru": ("Russian", "Русский"),
    "sv": ("Swedish", "Svenska"),
    "th": ("Thai", "ไทย"),
    "tr": ("Turkish", "Türkçe"),
    "uk": ("Ukrainian", "Українська"),
    "vi": ("Vietnamese", "Tiếng Việt"),
    "zh-Hans": ("Chinese, Simplified", "简体中文"),
    "zh-Hant": ("Chinese, Traditional", "繁體中文"),
}

TRANSLATION_SYSTEM = """\
You translate passages from primary Stoic texts for "A Stoic Mind", a reading
and reflective practice app. You are given one passage in English (a public
domain translation) and a target language.

Rules:
- Translate the passage into the target language, faithfully and completely.
- Write natural, clear, modern prose in the target language; do not imitate
  the archaic register of the English source.
- Preserve the paragraph breaks of the source. No headers, footnotes, or
  commentary of any kind.
- Output ONLY the translation, nothing else.
"""

TRANSLATION_SYSTEM_FROM_ORIGINAL = """\
You translate passages from primary Stoic texts for "A Stoic Mind", a reading
and reflective practice app. You are given one passage in its original ancient
language, a public-domain English translation of it as a reference, and a
target language.

Rules:
- Translate from the ORIGINAL text into the target language, faithfully and
  completely. Use the English translation only as a check on your reading of
  the original; where they diverge, follow the original.
- The original may extend slightly beyond the reference translation at either
  end (section boundaries differ); translate only the span the reference
  translation covers.
- Write natural, clear, modern prose in the target language; do not imitate
  the archaic register of the reference translation.
- Preserve the paragraph breaks of the original. No headers, footnotes, or
  commentary of any kind.
- Output ONLY the translation, nothing else.
"""

# original_language codes -> name used in the prompt
ORIGINAL_LANGUAGES = {"grc": "Ancient Greek", "la": "Latin"}

_miss_cap = MissCap(limit=60, window_seconds=3600.0, what="translation")


def _prompt(passage: Passage, language: str) -> str:
    target = f"Target language: {LANGUAGES[language][0]}\n\n"
    if passage.original_text is not None:
        original_name = ORIGINAL_LANGUAGES.get(
            passage.original_language or "", "the original language"
        )
        return (
            f"{target}"
            f"Original ({passage.author}, {passage.reference}, {original_name}, "
            f"ed. {passage.original_source}):\n\n{passage.original_text}\n\n"
            f"Reference English translation (trans. {passage.translator}):\n\n"
            f"{passage.text}"
        )
    return (
        f"{target}"
        f"Passage ({passage.author}, {passage.reference}, "
        f"trans. {passage.translator}):\n\n{passage.text}"
    )


def _store(passage_id: int, language: str, text: str, model: str) -> None:
    # Fresh session: the request-scoped one is busy backing the stream.
    with SessionLocal() as db:
        db.add(
            PassageTranslation(
                passage_id=passage_id, language=language, text=text, model=model
            )
        )
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request translated the same pair first; theirs won.
            db.rollback()


def _generate_stream(passage: Passage, language: str) -> Iterator[str]:
    """Yield translation text deltas, caching the full text once complete."""
    settings = get_settings()
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    chunks: list[str] = []
    system = (
        TRANSLATION_SYSTEM_FROM_ORIGINAL
        if passage.original_text is not None
        else TRANSLATION_SYSTEM
    )
    with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=4000,
        system=system,
        messages=[{"role": "user", "content": _prompt(passage, language)}],
    ) as stream:
        for text in stream.text_stream:
            chunks.append(text)
            yield text
        record_usage("translation", stream.get_final_message())
    full = "".join(chunks).strip()
    if full:
        _store(passage.id, language, full, settings.anthropic_model)


def get_translation(db: Session, passage: Passage, language: str) -> str:
    """The passage as the reader sees it in `language` — cached translation,
    or generated (and cached) now. Falls back to the English for "" or unknown
    codes. Used by reflections/chat seeding so quotes match the displayed text."""
    if not language or language not in LANGUAGES:
        return passage.text
    row = db.get(PassageTranslation, (passage.id, language))
    if row is not None:
        return row.text
    return "".join(_generate_stream(passage, language)).strip() or passage.text


@router.get("/translation/languages", response_model=list[LanguageOut])
def list_languages():
    return [
        LanguageOut(code=code, name=name, native=native)
        for code, (name, native) in sorted(LANGUAGES.items(), key=lambda i: i[1][0])
    ]


@router.get("/passages/{passage_id}/translation")
def passage_translation(
    passage_id: int,
    language: str,
    request: Request,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """SSE stream of the passage in the target language; instant when cached."""
    if language not in LANGUAGES:
        raise HTTPException(422, "Unsupported language code")
    passage = db.get(Passage, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")

    cached = db.get(PassageTranslation, (passage_id, language))
    if cached is None:
        _miss_cap.check(request)
    cached_text = cached.text if cached is not None else None

    def event_stream() -> Iterator[str]:
        meta = {"passage_id": passage_id, "language": language}
        yield f"event: meta\ndata: {json.dumps(meta)}\n\n"
        try:
            if cached_text is not None:
                yield f"data: {json.dumps(cached_text)}\n\n"
            else:
                for delta in _generate_stream(passage, language):
                    yield f"data: {json.dumps(delta)}\n\n"
        except Exception as exc:
            logger.exception("translation stream failed")
            yield f"event: error\ndata: {json.dumps({'error': f'{type(exc).__name__}: {exc}'})}\n\n"
        yield "event: done\ndata: {}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
