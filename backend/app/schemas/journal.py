"""Journal shapes. Input and output kept separate; `date` is stamped by the
backend (same clock as the daily passage), never client-supplied."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class JournalEntryCreate(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
    # The passage that prompted the entry (usually today's daily passage).
    passage_id: uuid.UUID | None = None


class JournalEntryUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


class JournalEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    passage_id: uuid.UUID | None
    date: date
    content: str
    # The LLM's response to the entry. Null until generated (or when
    # generation was unavailable) — the entry always stands on its own.
    reflection: str | None
    created_at: datetime
    updated_at: datetime


class TranscriptOut(BaseModel):
    # The recognized text of a dictated entry — the client appends it to the
    # draft; nothing is saved until the user saves the entry itself.
    text: str


class JournalStatsOut(BaseModel):
    total_entries: int
    # Consecutive days with at least one entry, ending today (or yesterday
    # when today has no entry yet). 0 = no current streak.
    streak_days: int
