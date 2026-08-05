"""Tradition shapes. The slugs are stable keys stored on rows
(passages.tradition, users.tradition, conversations.tradition, ...) —
append-only, never renamed, like practice guide keys."""
from typing import Literal

from pydantic import BaseModel

Tradition = Literal["stoicism", "transcendentalism"]


class TraditionOut(BaseModel):
    slug: Tradition
    name: str
    # The app identity this tradition wears ("A Stoic Mind",
    # "A Transcendental Mind") — the title dropdown swaps the whole brand.
    brand: str
    tagline: str
    # False while the tradition's corpus and voices haven't shipped — it is
    # listed (the UI may show it as coming soon) but not choosable.
    available: bool


class TraditionChoice(BaseModel):
    tradition: Tradition
