import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.routes.admin import router as admin_router
from app.routes.audio import router as audio_router
from app.routes.auth import router as auth_router
from app.routes.billing import router as billing_router
from app.routes.chat import router as chat_router
from app.routes.daily import router as daily_router
from app.routes.journal import router as journal_router
from app.routes.passage import router as passage_router
from app.routes.practice import router as practice_router
from app.routes.reading import router as reading_router
from app.schemas.meta import MetaOut

logger = logging.getLogger("astoicmind")

_settings = get_settings()

# Error tracking: a no-op unless SENTRY_DSN is set (production only).
if _settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(
        dsn=_settings.sentry_dsn,
        traces_sample_rate=0.1,
        send_default_pii=False,  # never ship user content
    )

# Loud misconfiguration guards. APP_ENV=production is set only by the
# backend Dockerfile, so these fire exactly where they matter.
if _settings.app_env == "production":
    if _settings.auth_secret == "dev-only-change-me":
        logger.critical(
            "AUTH_SECRET is the dev default in production — every session "
            "cookie and password-reset token is forgeable. Set AUTH_SECRET."
        )
    if not _settings.auth_cookie_secure:
        logger.warning(
            "AUTH_COOKIE_SECURE is false in production — session cookies "
            "will be sent over plain HTTP. Set AUTH_COOKIE_SECURE=true."
        )
    if not _settings.public_base_url:
        logger.warning(
            "PUBLIC_BASE_URL is unset in production — password-reset emails "
            "and Stripe redirects will point at localhost. Set it to the "
            "frontend origin (e.g. https://example.com)."
        )

app = FastAPI(title=f"{_settings.app_name} API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_credentials=True,  # auth cookie
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(audio_router)
app.include_router(auth_router)
app.include_router(daily_router)
app.include_router(journal_router)
app.include_router(passage_router)
app.include_router(practice_router)
app.include_router(reading_router)
app.include_router(chat_router)  # optional module — see app/services/chat.py
app.include_router(billing_router)
app.include_router(admin_router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta", response_model=MetaOut)
def meta() -> MetaOut:
    """Public feature flags the frontend reads at load (e.g. whether to show
    the verify-your-email surface). Extend as new flavors appear."""
    settings = get_settings()
    return MetaOut(
        require_email_verification=settings.require_email_verification,
        google_sign_in=bool(settings.google_client_id and settings.google_client_secret),
    )
