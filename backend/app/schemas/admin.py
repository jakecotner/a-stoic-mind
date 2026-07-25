import uuid
from datetime import datetime

from pydantic import BaseModel


class TierUpdate(BaseModel):
    tier: str


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
