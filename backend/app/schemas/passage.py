"""Corpus shapes. The corpus is public, read-only content — output only."""
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict


class WorkOut(BaseModel):
    """One work in the library, aggregated from its passages."""

    author: str
    work: str
    translator: str
    passage_count: int
    # Language of the ingested original text, when any passage has one.
    original_language: Literal["grc", "la"] | None


class PassageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    author: str
    work: str
    reference: str
    position: int
    translator: str
    text: str
    original_language: Literal["grc", "la"] | None


class BreakdownOut(BaseModel):
    """A passage's cached LLM breakdown. Null when generation is
    unavailable (no LLM key, or the call failed) — never an error."""

    passage_id: uuid.UUID
    breakdown: str | None
