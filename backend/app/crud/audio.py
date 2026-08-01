"""DB access for cached narration audio."""
import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import BreakdownAudio, PassageAudio


def get_passage_audio(
    db: Session, passage_id: uuid.UUID, voice: str
) -> PassageAudio | None:
    return db.get(PassageAudio, (passage_id, voice))


def insert_passage_audio(
    db: Session, passage_id: uuid.UUID, voice: str, media_type: str, data: bytes
) -> PassageAudio:
    """Insert-or-lose: on a concurrent-listener race the first writer wins
    and their row is returned."""
    row = PassageAudio(
        passage_id=passage_id, voice=voice, media_type=media_type, data=data
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.get(PassageAudio, (passage_id, voice))
    return row


def get_breakdown_audio(
    db: Session, passage_id: uuid.UUID, language: str, voice: str
) -> BreakdownAudio | None:
    return db.get(BreakdownAudio, (passage_id, language, voice))


def insert_breakdown_audio(
    db: Session,
    passage_id: uuid.UUID,
    language: str,
    voice: str,
    media_type: str,
    data: bytes,
) -> BreakdownAudio:
    """Insert-or-lose, like insert_passage_audio."""
    row = BreakdownAudio(
        passage_id=passage_id,
        language=language,
        voice=voice,
        media_type=media_type,
        data=data,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return db.get(BreakdownAudio, (passage_id, language, voice))
    return row
