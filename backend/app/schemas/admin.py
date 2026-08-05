import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel


class TierUpdate(BaseModel):
    tier: str


class AdminTotals(BaseModel):
    users: int
    verified_users: int
    plus_users: int
    journal_entries: int
    conversations: int
    chat_turns: int
    practice_sessions: int
    passages_read: int
    notes: int


class AdminDayRow(BaseModel):
    """One calendar day of activity, zero-filled — the frontend charts the
    list without gap handling."""

    day: date
    journal_entries: int
    chat_turns: int
    practice_sessions: int
    passages_read: int
    notes: int


class AdminLlmDayRow(BaseModel):
    day: date
    model: str
    calls: int
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int


class AdminStatsOut(BaseModel):
    totals: AdminTotals
    days: list[AdminDayRow]
    llm_days: list[AdminLlmDayRow]


class AdminUserRow(BaseModel):
    id: uuid.UUID
    email: str
    tier: Literal["free", "plus"]
    is_verified: bool
    is_superuser: bool
    oauth_providers: list[str]
    journal_entries: int
    chat_turns: int
    practice_sessions: int
    passages_read: int
    notes: int
    last_active: datetime | None


class UsageSummaryRow(BaseModel):
    month: datetime
    user_id: uuid.UUID | None  # None = anonymous / shared artifacts
    kind: str
    model: str
    calls: int
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
