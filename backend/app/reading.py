"""Sequential-reading endpoints: list works, page through a work's passages.

Public — the corpus is public-domain text; no auth involved.
"""
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import Passage, PassageAudio
from app.ratelimit import MissCap
from app.schemas import ReadingPageOut, TocOut, TocSection, VoiceOut, WorkOut
from app.tts import VOICES, resolve_voice, synthesize

router = APIRouter(prefix="/api", tags=["reading"])


@router.get("/works", response_model=list[WorkOut])
def list_works(db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            Passage.work,
            Passage.author,
            Passage.translator,
            func.count().label("passage_count"),
            func.min(Passage.id).label("first_id"),
        )
        .group_by(Passage.work, Passage.author, Passage.translator)
        .order_by(func.min(Passage.id))
    ).all()
    return [
        WorkOut(
            work=r.work,
            author=r.author,
            translator=r.translator,
            passage_count=r.passage_count,
        )
        for r in rows
    ]


@router.get("/reading/toc", response_model=TocOut)
def reading_toc(work: str, db: Session = Depends(get_db)):
    """Table of contents: passages grouped by their major division, derived
    from the reference — "Meditations 5.20" → Book 5, "Letters 78.4-6" →
    Letter 78, "Enchiridion 5" → Chapter 5. Offsets index into the same
    reading order /reading/passages pages through."""
    rows = db.execute(
        select(Passage.reference).where(Passage.work == work).order_by(Passage.id)
    ).all()
    if not rows:
        raise HTTPException(404, "Work not found")

    if "Letters" in work:
        prefix = "Letter"
    elif work == "Meditations":
        prefix = "Book"
    else:
        prefix = "Chapter"

    sections: list[TocSection] = []
    for idx, row in enumerate(rows):
        m = re.match(r"(\d+)", row.reference.rsplit(" ", 1)[-1])
        label = f"{prefix} {m.group(1)}" if m else row.reference
        if not sections or sections[-1].label != label:
            sections.append(TocSection(label=label, offset=idx, count=0))
        sections[-1].count += 1
    return TocOut(work=work, sections=sections)


_miss_cap = MissCap(limit=30, window_seconds=3600.0, what="narration")

_AUDIO_CACHE_HEADERS = {"Cache-Control": "public, max-age=31536000, immutable"}


@router.get("/tts/voices", response_model=list[VoiceOut])
def list_voices():
    """Narration voices a listener may pick from (the configured default
    first, marked)."""
    default = get_settings().tts_voice
    return sorted(
        (
            VoiceOut(id=vid, description=desc, default=vid == default)
            for vid, desc in VOICES.items()
        ),
        key=lambda v: not v.default,
    )


@router.get("/passages/{passage_id}/audio")
def passage_audio(
    passage_id: int,
    request: Request,
    voice: str = "",
    db: Session = Depends(get_db),
):
    """Narration of one passage, synthesized on first listen and cached forever
    (the corpus is immutable, hence the immutable cache headers)."""
    voice = resolve_voice(voice)
    row = db.get(PassageAudio, (passage_id, voice))
    if row is None:
        passage = db.get(Passage, passage_id)
        if passage is None:
            raise HTTPException(404, "Passage not found")
        _miss_cap.check(request)
        data, media_type = synthesize(passage.text, voice)
        row = PassageAudio(
            passage_id=passage_id, voice=voice, media_type=media_type, data=data
        )
        db.add(row)
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request synthesized the same passage first; theirs won.
            db.rollback()
            row = db.get(PassageAudio, (passage_id, voice))
            if row is None:  # pragma: no cover — commit raced then vanished
                raise HTTPException(500, "Audio cache write failed")
    return Response(
        content=row.data, media_type=row.media_type, headers=_AUDIO_CACHE_HEADERS
    )


@router.get("/reading/passages", response_model=ReadingPageOut)
def reading_passages(
    work: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=50),
    passage_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Passages of one work in reading order (id order within a work).

    Instead of work+offset, callers may pass passage_id to get the page
    starting at that passage (used to jump from a margin note to its spot).
    """
    if passage_id is not None:
        target = db.get(Passage, passage_id)
        if target is None:
            raise HTTPException(404, "Passage not found")
        work = target.work
        offset = db.scalar(
            select(func.count())
            .select_from(Passage)
            .where(Passage.work == work, Passage.id < passage_id)
        )
    elif work is None:
        raise HTTPException(422, "Pass either work or passage_id")
    total = db.scalar(
        select(func.count()).select_from(Passage).where(Passage.work == work)
    )
    if not total:
        raise HTTPException(404, "Work not found")
    passages = db.scalars(
        select(Passage)
        .where(Passage.work == work)
        .order_by(Passage.id)
        .offset(offset)
        .limit(limit)
    ).all()
    return ReadingPageOut(work=work, total=total, offset=offset, passages=passages)
