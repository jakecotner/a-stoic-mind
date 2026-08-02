"""SQLAlchemy models — the "things the app remembers".

CRITICAL: every model module MUST be imported here. Alembic autogenerate
only sees models that are imported when Base.metadata loads (alembic/env.py
imports Base from this package) — a model file that isn't imported here
produces an EMPTY migration and the table silently never exists.
"""
from app.models.audio import BreakdownAudio, PassageAudio
from app.models.base import Base
from app.models.daily import DailyPassage
from app.models.journal import JournalEntry
from app.models.oauth import OAuthAccount
from app.models.passage import Passage, PassageBreakdown
from app.models.practice import PracticeIntention
from app.models.reading import Note, PassageRead
from app.models.usage import LlmUsage
from app.models.user import User

__all__ = [
    "Base",
    "BreakdownAudio",
    "DailyPassage",
    "JournalEntry",
    "LlmUsage",
    "Note",
    "OAuthAccount",
    "Passage",
    "PassageAudio",
    "PassageBreakdown",
    "PassageRead",
    "PracticeIntention",
    "User",
]
