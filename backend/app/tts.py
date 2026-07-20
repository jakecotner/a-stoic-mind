"""Speech synthesis for passage narration (OpenAI audio API over httpx).

Long passages are synthesized in sentence-aligned chunks and the MP3 frames
concatenated — the API caps input at 4096 characters, and browsers play
concatenated MP3 streams without complaint (duration metadata may be
approximate, which is fine for straight-through narration).
"""
import re

import httpx
from fastapi import HTTPException

from app.config import get_settings

# The API's input cap is 4096 chars; stay under it with headroom.
MAX_CHUNK = 3800

# Only the gpt-4o-* speech models accept style instructions.
INSTRUCTIONS = (
    "Read this classical Stoic text aloud in a calm, measured, contemplative "
    "voice — unhurried, warm, without theatrics. Pause naturally at sentence "
    "boundaries."
)


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


def synthesize(text: str) -> tuple[bytes, str]:
    """Return (audio_bytes, media_type). Raises HTTPException on failure."""
    settings = get_settings()
    if not settings.openai_api_key:
        raise HTTPException(503, "Audio narration is not configured")

    parts: list[bytes] = []
    for chunk in _chunks(text):
        body: dict = {
            "model": settings.tts_model,
            "voice": settings.tts_voice,
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
            raise HTTPException(502, "Speech synthesis failed")
        parts.append(resp.content)
    return b"".join(parts), "audio/mpeg"
