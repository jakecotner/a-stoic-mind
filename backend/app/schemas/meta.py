"""Shape of GET /api/meta — the public, unauthenticated feature flags the
frontend needs before it can render (which optional behaviors are on)."""
from pydantic import BaseModel


class MetaOut(BaseModel):
    require_email_verification: bool
