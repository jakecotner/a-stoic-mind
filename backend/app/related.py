"""Entry↔passage cross-links (MONETIZATION.md slice 4; Plus-only).

Two lookups, mirror images of each other:
- a journal entry's kindred passages ("passages that speak to this"),
- a passage's kindred journal entries ("from your journal").

With Voyage configured both run over pgvector embeddings — passages are
embedded at ingest, notes best-effort at write time (app/journal.py) and
lazily backfilled here. Without Voyage both degrade to Postgres full-text
search, like app/retrieval.py, so the feature works keyless. Pure reads over
existing vectors: no LLM calls, so no usage metering.
"""
import logging
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.auth import current_active_user
from app.config import get_settings
from app.db import get_db
from app.models import Note, Passage, User
from app.retrieval import embed_texts, search_passages
from app.schemas import NoteOut, PassageOut
from app.usage import require_plus

logger = logging.getLogger("stoa")

router = APIRouter(prefix="/api", tags=["related"])

RELATED_K = 3
# Cross-links are suggestions, not search results: past this cosine distance
# a "related" entry reads as a non sequitur, so show nothing instead.
MAX_DISTANCE = 0.65


def _embed_missing_notes(db: Session, user_id) -> None:
    """Lazily embed this user's un-embedded notes (bounded batch). Best
    effort: cross-links just see fewer notes if Voyage is down."""
    notes = list(
        db.scalars(
            select(Note)
            .where(Note.user_id == user_id, Note.embedding.is_(None))
            .order_by(Note.created_at.desc())
            .limit(50)
        )
    )
    if not notes:
        return
    try:
        vectors = embed_texts([n.content for n in notes], input_type="document")
        for note, vec in zip(notes, vectors):
            note.embedding = vec
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("note embedding backfill failed")


@router.get("/notes/{note_id}/related-passages", response_model=list[PassageOut])
def related_passages(
    note_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    require_plus(user, "Journal cross-links are part of Stoa Plus.")
    note = db.get(Note, note_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(404, "Note not found")

    if note.embedding is not None:
        rows = db.execute(
            select(Passage, Passage.embedding.cosine_distance(note.embedding))
            .where(Passage.embedding.is_not(None))
            .order_by(Passage.embedding.cosine_distance(note.embedding))
            .limit(RELATED_K)
        ).all()
        return [p for p, dist in rows if dist <= MAX_DISTANCE]
    # No embedding (keyless mode or embed failure): text search.
    return search_passages(db, note.content, RELATED_K)


@router.get("/passages/{passage_id}/related-notes", response_model=list[NoteOut])
def related_notes(
    passage_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(current_active_user),
):
    require_plus(user, "Journal cross-links are part of Stoa Plus.")
    passage = db.get(Passage, passage_id)
    if passage is None:
        raise HTTPException(404, "Passage not found")

    # Margin notes on this very passage are already on screen — exclude them.
    not_own_margin = Note.passage_id.is_distinct_from(passage.id)

    if get_settings().voyage_api_key and passage.embedding is not None:
        _embed_missing_notes(db, user.id)
        rows = db.execute(
            select(Note, Note.embedding.cosine_distance(passage.embedding))
            .options(joinedload(Note.passage))
            .where(
                Note.user_id == user.id,
                Note.embedding.is_not(None),
                not_own_margin,
            )
            .order_by(Note.embedding.cosine_distance(passage.embedding))
            .limit(RELATED_K)
        ).all()
        notes = [n for n, dist in rows if dist <= MAX_DISTANCE]
    else:
        words = re.findall(r"[a-zA-Z]{4,}", passage.text)[:30]
        if not words:
            return []
        ts_query = func.websearch_to_tsquery("english", " OR ".join(words))
        ts_vector = func.to_tsvector("english", Note.content)
        notes = list(
            db.scalars(
                select(Note)
                .options(joinedload(Note.passage))
                .where(
                    Note.user_id == user.id,
                    not_own_margin,
                    ts_vector.op("@@")(ts_query),
                )
                .order_by(func.ts_rank(ts_vector, ts_query).desc())
                .limit(RELATED_K)
            )
        )
    for n in notes:
        n.thread_id = None  # NoteOut field; threads aren't relevant here
    return notes
