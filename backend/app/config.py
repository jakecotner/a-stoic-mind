from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://stoa:stoa@localhost:5433/stoa"

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
    # Leave unset to fall back to the ANTHROPIC_API_KEY env var / `ant` profile.
    anthropic_api_key: str | None = None
    voyage_api_key: str | None = None

    # Passage narration (OpenAI TTS; Anthropic has no TTS API). Leave the key
    # unset to disable audio — the endpoint then returns 503 and the frontend
    # hides nothing (the play button simply reports audio as unavailable).
    openai_api_key: str | None = None
    tts_model: str = "gpt-4o-mini-tts"
    tts_voice: str = "onyx"

    anthropic_model: str = "claude-opus-4-8"
    chat_effort: str = "medium"
    chat_max_tokens: int = 8192

    # Free-tier monthly Stoa reflection turns (MONETIZATION.md slice 2).
    # "plus" tier and superusers are uncapped.
    free_tier_monthly_turns: int = 10

    # Stripe (MONETIZATION.md slice 3). All unset = payments not live:
    # checkout/portal return 503 and the frontend keeps saying "payments
    # aren't live yet". Webhook endpoint: POST /api/billing/webhook.
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_annual: str | None = None  # price_... id for $49/yr
    stripe_price_monthly: str | None = None  # price_... id for $6.99/mo
    # Card-required free trial on new subscriptions; 0 disables (§5 slice 3
    # names the fallback if trial abuse appears).
    stripe_trial_days: int = 7
    # Absolute origin for Stripe redirect URLs (e.g. https://astoicmind.com).
    # Unset: derived per-request from the Origin header / request base URL,
    # which is right in dev; set it explicitly in production.
    public_base_url: str | None = None

    retrieval_top_k: int = 6
    history_max_messages: int = 20

    # Auth (fastapi-users). Override auth_secret in .env for anything non-local.
    auth_secret: str = "dev-only-change-me"
    auth_cookie_secure: bool = False  # set True when serving over HTTPS
    auth_token_lifetime_seconds: int = 60 * 60 * 24 * 30  # 30 days

    cors_origins: list[str] = ["http://localhost:5173"]

    # Production: directory of built frontend assets to serve at "/"
    # (set by the Dockerfile; unset in dev, where Vite serves the frontend).
    static_dir: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
