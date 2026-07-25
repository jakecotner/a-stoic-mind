"""Daily passage shapes."""
from datetime import date

from pydantic import BaseModel

from app.schemas.passage import PassageOut


class DailyOut(BaseModel):
    date: date
    passage: PassageOut
    # Null when reflections are unavailable (no LLM key configured, or the
    # generation call failed) — the passage still renders.
    breakdown: str | None
