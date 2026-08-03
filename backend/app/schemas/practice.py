"""Practice shapes: the intention, sessions and their guides, the month
calendar, and one day's detail."""
import uuid
from datetime import date, datetime, time
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.journal import JournalEntryOut
from app.schemas.passage import PassageOut

GuideKey = Literal["morning", "evening"]


class IntentionIn(BaseModel):
    minutes_per_day: int = Field(ge=1, le=480)
    time_of_day: time | None = None


class IntentionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    minutes_per_day: int
    time_of_day: time | None


class GuideStepOut(BaseModel):
    """One step of a guided session. `passage` steps present the day's
    passage (with narration); `prompt` steps seed the journal pad."""

    key: str
    kind: Literal["passage", "prompt"]
    title: str
    # Guidance shown under the title — what to do, or the prompt to write to.
    body: str


class GuideOut(BaseModel):
    key: GuideKey
    title: str
    tagline: str
    steps: list[GuideStepOut]


class SessionStartIn(BaseModel):
    guide: GuideKey | None = None


class SessionEndIn(BaseModel):
    steps_completed: list[Annotated[str, Field(max_length=40)]] = Field(
        default_factory=list, max_length=12
    )


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    date: date
    # Guide key as stored — old sessions keep their label even if the guide
    # is later retired, so this is a plain string, not the Literal.
    guide: str | None
    started_at: datetime
    ended_at: datetime | None
    duration_seconds: int | None
    steps_completed: list[str]


class CalendarDayOut(BaseModel):
    """One day of the month grid: the shared daily passage plus counts of
    the caller's own activity."""

    date: date
    daily_reference: str | None
    journal_count: int
    note_count: int
    read_count: int
    # Ended sessions only; an abandoned (never-ended) session counts nothing.
    session_count: int
    practice_seconds: int


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
    sessions: list[SessionOut]
