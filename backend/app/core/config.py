from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Product name, used in the API title, transactional email copy, and the
    # default From address. rename.py updates it when spawning a project.
    app_name: str = "A Stoic Mind"

    database_url: str = "postgresql+psycopg://astoicmind:astoicmind@localhost:5432/astoicmind"

    @field_validator("database_url", mode="before")
    @classmethod
    def _force_psycopg_driver(cls, v: object) -> object:
        """Hosted Postgres (Railway, Heroku, ...) hands out postgres:// or
        postgresql:// URLs; SQLAlchemy would resolve those to psycopg2, which
        isn't installed. Rewrite to the psycopg (v3) driver.

        Also tolerate copy/paste artifacts (surrounding quotes, whitespace)
        and fail fast with a redacted hint when the value can't be a URL —
        SQLAlchemy's own parse error refuses to show the string, which makes
        deploy logs undiagnosable.
        """
        if not isinstance(v, str):
            return v
        cleaned = v.strip()
        if (
            len(cleaned) >= 2
            and cleaned[0] == cleaned[-1]
            and cleaned[0] in ("'", '"')
        ):
            cleaned = cleaned[1:-1].strip()
        if "${{" in cleaned or "}}" in cleaned:
            raise ValueError(
                "DATABASE_URL contains a literal '${{...}}' Railway template that "
                "was never resolved. In the Railway dashboard the reference must "
                "render as a chip/tag (use autocomplete), and the referenced "
                "service name must match exactly."
            )
        for prefix in ("postgres://", "postgresql://"):
            if cleaned.startswith(prefix):
                return "postgresql+psycopg://" + cleaned[len(prefix):]
        if not cleaned.startswith("postgresql+psycopg://"):
            hint = cleaned[:12] + "..." if cleaned else "<empty string>"
            raise ValueError(
                f"DATABASE_URL does not look like a Postgres URL (starts with: {hint!r}). "
                "Check the environment variable — an empty value or a typo in the "
                "scheme are the usual causes."
            )
        return cleaned

    # Read from .env and passed to the SDK explicitly (pydantic-settings does
    # not export .env values to os.environ, so the SDK can't see them itself).
    # Leave unset to fall back to the ANTHROPIC_API_KEY env var.
    anthropic_api_key: str | None = None

    anthropic_model: str = "claude-opus-4-8"

    # Free-tier monthly metered LLM turns (see app/services/usage.py). "plus"
    # tier and
    # superusers are uncapped.
    free_tier_monthly_turns: int = 10

    # Stripe. All unset = payments not live: checkout/portal return 503 and
    # the frontend keeps saying "payments aren't live yet". Webhook endpoint:
    # POST /api/billing/webhook.
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_annual: str | None = None  # price_... id
    stripe_price_monthly: str | None = None  # price_... id
    # Card-required free trial on new subscriptions; 0 disables.
    stripe_trial_days: int = 7
    # Absolute origin of the FRONTEND (the Next.js app) for Stripe redirect
    # URLs and links in emails (e.g. https://example.com). Unset: derived
    # per-request from the Origin header / request base URL, which is right
    # in dev; set it explicitly in production.
    public_base_url: str | None = None

    # Transactional email (password resets) via Resend. Unset: emails are
    # logged instead of sent — dev stays inspectable, prod misconfig is loud
    # in the logs rather than silent.
    resend_api_key: str | None = None
    email_from: str = "A Stoic Mind <onboarding@resend.dev>"

    # Error tracking. Unset: Sentry never initializes (dev default).
    sentry_dsn: str | None = None

    # Email verification (config flavor, not a module — see MODULES.md).
    # Off: registration is frictionless and the verify surface stays dark.
    # On: new accounts get a verification email; unverified users can sign
    # in and look around, but paid actions (checkout)
    # require a verified address, and the frontend shows a persistent
    # verify banner. Flip it any time — no schema change involved.
    require_email_verification: bool = False

    # Auth (fastapi-users). Override auth_secret in .env for anything non-local.
    auth_secret: str = "dev-only-change-me"
    auth_cookie_secure: bool = False  # set True when serving over HTTPS
    auth_token_lifetime_seconds: int = 60 * 60 * 24 * 30  # 30 days

    # The browser normally reaches this API through the Next.js rewrite proxy
    # (same origin, no CORS); this list only matters for direct cross-origin
    # calls, e.g. tools hitting the API straight from a browser.
    cors_origins: list[str] = ["http://localhost:3000"]

    # "dev" | "production" — set by the backend Dockerfile; gates the loud
    # misconfiguration warnings in app/main.py.
    app_env: str = "dev"


@lru_cache
def get_settings() -> Settings:
    return Settings()
