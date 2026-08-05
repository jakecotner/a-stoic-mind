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
from collections.abc import Iterator

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

# The mentor's replies are conversation, not recitation.
MENTOR_INSTRUCTIONS = (
    "Speak this reply as a seasoned, warm mentor talking with a student — "
    "calm, direct, conversational, unhurried, without theatrics."
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


def synthesize(
    text: str, voice: str, instructions: str = INSTRUCTIONS
) -> tuple[bytes, str]:
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
            body["instructions"] = instructions
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


def synthesize_stream(
    text: str, voice: str, instructions: str = INSTRUCTIONS
) -> Iterator[bytes]:
    """Like synthesize, but yields MP3 frames as the provider produces them,
    so the browser can start playback before synthesis finishes.

    Not a bare generator on purpose: the unconfigured check must raise
    BEFORE the route hands a 200 status line to the client. A provider
    failure mid-stream can't change the status anymore — it's logged and the
    stream truncates, which the player surfaces as an early end."""
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(503, "Audio narration is not configured")

    def frames() -> Iterator[bytes]:
        for chunk in _chunks(text):
            body: dict = {
                "model": settings.tts_model,
                "voice": voice,
                "input": chunk,
                "response_format": "mp3",
            }
            if settings.tts_model.startswith("gpt-4o"):
                body["instructions"] = instructions
            with httpx.stream(
                "POST",
                "https://api.openai.com/v1/audio/speech",
                headers={"Authorization": f"Bearer {settings.openai_api_key}"},
                json=body,
                timeout=120.0,
            ) as resp:
                if resp.status_code != 200:
                    resp.read()
                    logger.error(
                        "TTS stream failed: %s %s",
                        resp.status_code,
                        resp.text[:500],
                    )
                    return
                yield from resp.iter_bytes()

    return frames()


# OpenAI's transcription endpoint caps uploads at 25 MB — reject earlier
# with a clearer message (25 MB of m4a is well over an hour of dictation).
MAX_DICTATION_BYTES = 25 * 1024 * 1024


def transcribe(data: bytes, filename: str, content_type: str) -> str:
    """Speech-to-text for journal dictation. Returns the recognized text;
    raises HTTPException when unconfigured or the provider fails."""
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(503, "Dictation is not configured")
    if not data:
        raise HTTPException(422, "Empty recording")
    if len(data) > MAX_DICTATION_BYTES:
        raise HTTPException(413, "Recording too long — try shorter takes")
    resp = httpx.post(
        "https://api.openai.com/v1/audio/transcriptions",
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        data={"model": settings.stt_model},
        files={"file": (filename or "dictation.m4a", data, content_type or "audio/m4a")},
        timeout=120.0,
    )
    if resp.status_code != 200:
        logger.error(
            "STT request failed: %s %s", resp.status_code, resp.text[:500]
        )
        raise HTTPException(502, "Transcription failed")
    return str(resp.json().get("text", "")).strip()


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


# --- Word timings (click-to-jump). The TTS API returns no timestamps, so we
# run the finished recording back through speech-to-text asking for
# word-level timestamps and align them to the narrated text. whisper-1 is
# hardcoded: it's the only transcription model that returns word timestamps.
TIMING_STT_MODEL = "whisper-1"


def _transcribe_words(data: bytes, media_type: str) -> list[dict]:
    """Word-level timestamps for a recording: [{word, start, end}, ...]."""
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(503, "Audio narration is not configured")
    resp = httpx.post(
        "https://api.openai.com/v1/audio/transcriptions",
        headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        data={
            "model": TIMING_STT_MODEL,
            "response_format": "verbose_json",
            "timestamp_granularities[]": "word",
        },
        files={"file": ("narration.mp3", data, media_type or "audio/mpeg")},
        timeout=120.0,
    )
    if resp.status_code != 200:
        logger.error(
            "timing STT request failed: %s %s", resp.status_code, resp.text[:500]
        )
        raise HTTPException(502, "Timing analysis failed")
    return list(resp.json().get("words", []))


def _norm_word(w: str) -> str:
    return re.sub(r"[^a-z0-9]", "", w.lower())


def _align_starts(text: str, words: list[dict]) -> list[float]:
    """starts[i] = start second of the i-th whitespace token of `text`.

    The transcript of a TTS recording of this very text is near-verbatim, so
    a greedy monotonic match with a small lookahead window is enough; tokens
    the transcript skipped (numbers read differently, odd punctuation)
    inherit the previous known time, keeping the map monotonic."""
    tokens = text.split()
    starts: list[float | None] = [None] * len(tokens)
    j = 0
    for i, tok in enumerate(tokens):
        t = _norm_word(tok)
        if not t:
            continue
        for k in range(j, min(j + 8, len(words))):
            w = _norm_word(str(words[k].get("word", "")))
            if w and (w == t or w in t or t in w):
                starts[i] = float(words[k].get("start", 0.0))
                j = k + 1
                break
    last = 0.0
    filled: list[float] = []
    for s in starts:
        if s is not None and s >= last:
            last = s
        filled.append(last)
    return filled


def passage_timings(db: Session, passage_id: uuid.UUID, voice: str) -> list[float]:
    """The word-start map for a passage's narration, computed once per
    (passage, voice) and cached on the audio row. Synthesizes the narration
    first if nobody has listened yet."""
    row = audio_crud.get_passage_audio(db, passage_id, voice)
    if row is None:
        row = narrate_passage(db, passage_id, voice)
    if row.timings and "starts" in row.timings:
        return row.timings["starts"]
    passage = passage_crud.get(db, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")
    starts = _align_starts(passage.text, _transcribe_words(row.data, row.media_type))
    audio_crud.set_timings(db, row, starts)
    return starts


def breakdown_timings(
    db: Session, passage_id: uuid.UUID, language: str, voice: str
) -> list[float]:
    """Like passage_timings, for a breakdown's narration (aligned against the
    markdown-stripped text the narrator actually read)."""
    row = audio_crud.get_breakdown_audio(db, passage_id, language, voice)
    if row is None:
        row = narrate_breakdown(db, passage_id, language, voice)
    if row.timings and "starts" in row.timings:
        return row.timings["starts"]
    breakdown = passage_crud.get_breakdown(db, passage_id, language)
    if breakdown is None:
        raise HTTPException(404, "Breakdown not available yet")
    starts = _align_starts(
        strip_markdown(breakdown.text), _transcribe_words(row.data, row.media_type)
    )
    audio_crud.set_timings(db, row, starts)
    return starts
