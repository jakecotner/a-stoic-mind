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
    created_at: datetime
    updated_at: datetime
