from typing import Literal

from pydantic import BaseModel


class Turns(BaseModel):
    used: int
    limit: int


class BillingSummary(BaseModel):
    tier: Literal["free", "plus"]
    turns: Turns | None  # null = uncapped (plus, superuser)
    renews_at: str | None
    cancel_at_period_end: bool = False


class CheckoutRequest(BaseModel):
    plan: str  # "annual" | "monthly"
