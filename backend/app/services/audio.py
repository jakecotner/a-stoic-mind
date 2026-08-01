"""Speech synthesis for narration (OpenAI audio API over httpx), ported from
the first-generation stoa project.

Long texts are synthesized in sentence-aligned chunks and the MP3 frames
concatenated — the API caps input at 4096 characters, and browsers play
concatenated MP3 streams without complaint (duration metadata may be
approximate, which is fine for straight-through narration).
"""
import logging
import re
import uuid

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.crud import audio as audio_crud
from app.crud import passage as passage_crud
from app.models import BreakdownAudio, PassageAudio

logger = logging.getLogger(__name__)

# The API's input cap is 4096 chars; stay under it with headroom.
MAX_CHUNK = 3800

# Curated narration voices (all valid for the gpt-4o-* speech models). Kept
# deliberately small: every voice multiplies the worst-case synthesis spend,
# since audio is cached per (text, voice).
VOICES: dict[str, str] = {
    "onyx": "Deep and grounded",
    "sage": "Calm and clear",
    "fable": "Warm storyteller",
    "nova": "Bright and gentle",
}

# Only the gpt-4o-* speech models accept style instructions.
INSTRUCTIONS = (
    "Read this classical Stoic text aloud in a calm, measured, contemplative "
    "voice — unhurried, warm, without theatrics. Pause naturally at sentence "
    "boundaries."
)


def resolve_voice(requested: str) -> str:
    """An explicit request must be a curated voice; empty falls back to the
    configured default (which an operator may set to any provider voice)."""
    if requested and requested not in VOICES:
        raise HTTPException(422, "Unsupported voice")
    return requested or get_settings().tts_voice


def strip_markdown(md: str) -> str:
    """Reduce light markdown (the breakdowns' emphasis/quotes) to plain prose
    for narration — a narrator reading asterisks aloud breaks the spell."""
    text = re.sub(r"^#{1,6}\s+", "", md, flags=re.M)  # headers
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.M)  # list bullets
    text = re.sub(r"^\s*>\s?", "", text, flags=re.M)  # blockquote markers
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)  # links -> label
    text = re.sub(r"(\*\*|__|\*|_)(?=\S)|(?<=\S)(\*\*|__|\*|_)", "", text)  # emphasis
    return text.strip()


def _chunks(text: str) -> list[str]:
    """Split on sentence boundaries into chunks under MAX_CHUNK chars."""
    sentences = re.split(r"(?<=[.!?;])\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for s in sentences:
        if current and len(current) + 1 + len(s) > MAX_CHUNK:
            chunks.append(current)
            current = s
        else:
            current = f"{current} {s}" if current else s
        # A single pathological sentence longer than the cap: hard-split it.
        while len(current) > MAX_CHUNK:
            chunks.append(current[:MAX_CHUNK])
            current = current[MAX_CHUNK:].lstrip()
    if current:
        chunks.append(current)
    return chunks


def synthesize(text: str, voice: str) -> tuple[bytes, str]:
    """Return (audio_bytes, media_type). Raises HTTPException on failure."""
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(503, "Audio narration is not configured")

    parts: list[bytes] = []
    for chunk in _chunks(text):
        body: dict = {
            "model": settings.tts_model,
            "voice": voice,
            "input": chunk,
            "response_format": "mp3",
        }
        if settings.tts_model.startswith("gpt-4o"):
            body["instructions"] = INSTRUCTIONS
        resp = httpx.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json=body,
            timeout=120.0,
        )
        if resp.status_code != 200:
            # e.g. 401 bad key, 429 insufficient_quota (no billing on the
            # OpenAI account) — surface the provider's reason in the log.
            logger.error(
                "TTS request failed: %s %s", resp.status_code, resp.text[:500]
            )
            raise HTTPException(502, "Speech synthesis failed")
        parts.append(resp.content)
    return b"".join(parts), "audio/mpeg"


def narrate_passage(
    db: Session, passage_id: uuid.UUID, voice: str
) -> PassageAudio:
    """Synthesize one passage's narration and cache it (first listen only —
    the route serves cache hits without coming here)."""
    passage = passage_crud.get(db, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")
    data, media_type = synthesize(passage.text, voice)
    return audio_crud.insert_passage_audio(db, passage_id, voice, media_type, data)


def narrate_breakdown(
    db: Session, passage_id: uuid.UUID, language: str, voice: str
) -> BreakdownAudio:
    """Synthesize the narration of a passage's cached breakdown. 404 when the
    breakdown hasn't been generated yet — the play button only appears under
    a breakdown that's already on screen, so that's a stale or crafted URL."""
    breakdown = passage_crud.get_breakdown(db, passage_id, language)
    if breakdown is None:
        raise HTTPException(404, "Breakdown not available yet")
    data, media_type = synthesize(strip_markdown(breakdown.text), voice)
    return audio_crud.insert_breakdown_audio(
        db, passage_id, language, voice, media_type, data
    )
