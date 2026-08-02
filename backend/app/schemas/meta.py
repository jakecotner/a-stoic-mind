"""Shape of GET /api/meta — the public, unauthenticated feature flags the
frontend needs before it can render (which optional behaviors are on)."""
from pydantic import BaseModel


class MetaOut(BaseModel):
    require_email_verification: bool
    # Whether "Continue with Google" is configured on this server (see
    # app/services/oauth.py). False: the sign-in pages don't draw the button.
    google_sign_in: bool
