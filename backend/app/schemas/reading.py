"""Reader shapes: table of contents, margin notes, reading history."""
import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class TocPartOut(BaseModel):
    """One reading unit of a work — a book, letter, or chapter. part is the
    machine key (e.g. "4", "1.15", or "" for a work read whole); label is the
    human name (e.g. "Book 4", "Letter 13")."""

    part: str
    label: str
    passage_count: int


class NoteCreate(BaseModel):
    passage_id: uuid.UUID
    content: str = Field(min_length=1, max_length=10000)


class NoteUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    passage_id: uuid.UUID | None
    date: date
    content: str
    created_at: datetime
    updated_at: datetime


class MarkReadIn(BaseModel):
    work: str
    part: str = ""  # "" = the whole work (single-part works)


class MarkReadOut(BaseModel):
    # Passages newly recorded as read today (0 = this part was already
    # marked today).
    marked: int
