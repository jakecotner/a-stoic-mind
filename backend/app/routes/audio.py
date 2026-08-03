"""Narration routes. Public like the corpus itself — audio is synthesized on
first listen and cached forever, so each recording costs once; the miss cap
keeps a stranger from forcing thousands of fresh syntheses."""
import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.core.ratelimit import MissCap
from app.crud import audio as audio_crud
from app.schemas.audio import TimingsOut, VoiceOut
from app.services import audio as audio_service

router = APIRouter(prefix="/api", tags=["audio"])

# Sized for a real listen-through: continuous narration with reflections
# costs two fresh syntheses per passage on a work's first listen.
_miss_cap = MissCap(limit=120, window_seconds=3600.0, what="narration")

# The corpus and its cached breakdowns are immutable, so the audio is too.
_CACHE_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}


@router.get("/tts/voices", response_model=list[VoiceOut])
def list_voices():
    """Narration voices a listener may pick from (the configured default
    first, marked)."""
    default = get_settings().tts_voice
    return sorted(
        (
            VoiceOut(id=vid, description=desc, default=vid == default)
            for vid, desc in audio_service.VOICES.items()
        ),
        key=lambda v: not v.default,
    )


@router.get("/passages/{passage_id}/audio")
def passage_audio(
    passage_id: uuid.UUID,
    request: Request,
    voice: str = "",
    db: Session = Depends(get_db),
):
    """Narration of one passage — synthesized on the first listen anywhere,
    served from the cache after."""
    voice = audio_service.resolve_voice(voice)
    row = audio_crud.get_passage_audio(db, passage_id, voice)
    if row is None:
        _miss_cap.check(request)
        row = audio_service.narrate_passage(db, passage_id, voice)
    return Response(
        content=row.data, media_type=row.media_type, headers=_CACHE_HEADERS
    )


@router.get("/passages/{passage_id}/audio/timings", response_model=TimingsOut)
def passage_audio_timings(
    passage_id: uuid.UUID,
    request: Request,
    voice: str = "",
    db: Session = Depends(get_db),
):
    """Word-start map for a passage's narration (click-to-jump). Computed on
    the first request per (passage, voice) — one transcription pass — and
    cached forever with the audio."""
    voice = audio_service.resolve_voice(voice)
    row = audio_crud.get_passage_audio(db, passage_id, voice)
    if row is None or not row.timings:
        _miss_cap.check(request)
    return TimingsOut(starts=audio_service.passage_timings(db, passage_id, voice))


@router.get("/passages/{passage_id}/breakdown/audio/timings", response_model=TimingsOut)
def breakdown_audio_timings(
    passage_id: uuid.UUID,
    request: Request,
    voice: str = "",
    db: Session = Depends(get_db),
):
    """Word-start map for a breakdown's narration (English only, like the
    audio itself)."""
    voice = audio_service.resolve_voice(voice)
    row = audio_crud.get_breakdown_audio(db, passage_id, "en", voice)
    if row is None or not row.timings:
        _miss_cap.check(request)
    return TimingsOut(
        starts=audio_service.breakdown_timings(db, passage_id, "en", voice)
    )


@router.get("/passages/{passage_id}/breakdown/audio")
def breakdown_audio(
    passage_id: uuid.UUID,
    request: Request,
    voice: str = "",
    db: Session = Depends(get_db),
):
    """Narration of a passage's breakdown (English — the only language
    breakdowns are written in today)."""
    voice = audio_service.resolve_voice(voice)
    row = audio_crud.get_breakdown_audio(db, passage_id, "en", voice)
    if row is None:
        _miss_cap.check(request)
        row = audio_service.narrate_breakdown(db, passage_id, "en", voice)
    return Response(
        content=row.data, media_type=row.media_type, headers=_CACHE_HEADERS
    )
