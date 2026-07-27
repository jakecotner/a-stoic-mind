"""Practice shapes: the intention, the month calendar, and one day's detail."""
import uuid
from datetime import date, time

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.journal import JournalEntryOut
from app.schemas.passage import PassageOut


class IntentionIn(BaseModel):
    minutes_per_day: int = Field(ge=1, le=480)
    time_of_day: time | None = None


class IntentionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    minutes_per_day: int
    time_of_day: time | None


class CalendarDayOut(BaseModel):
    """One day of the month grid: the shared daily passage plus counts of
    the caller's own activity."""

    date: date
    daily_reference: str | None
    journal_count: int
    note_count: int
    read_count: int


class NoteWithPassageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    content: str
    # Where the note lives; None if its passage ever left the corpus.
    passage_reference: str | None


class ReadWorkOut(BaseModel):
    work: str
    author: str
    passage_count: int


class DayDetailOut(BaseModel):
    date: date
    daily: PassageOut | None
    journal: list[JournalEntryOut]
    notes: list[NoteWithPassageOut]
    reads: list[ReadWorkOut]
