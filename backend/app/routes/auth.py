"""Auth routes: the fastapi-users routers, /me endpoints, and the two
Google sign-in redirects."""
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.auth import (
    attach_session_cookie,
    auth_backend,
    bearer_backend,
    current_active_user,
    fastapi_users,
)
from app.core.config import get_settings
from app.core.db import get_db
from app.models import User
from app.schemas.user import UserCreate, UserRead
from app.services import oauth as oauth_service
from app.services import user as user_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

# JWT in an httponly cookie for the web app, bearer token for a future
# mobile app (see app/core/auth.py).
router.include_router(fastapi_users.get_auth_router(auth_backend))
router.include_router(fastapi_users.get_auth_router(bearer_backend), prefix="/bearer")
router.include_router(fastapi_users.get_register_router(UserRead, UserCreate))
# Password reset: /api/auth/forgot-password (always 202) + /reset-password.
# The email itself is sent from UserManager.on_after_forgot_password.
router.include_router(fastapi_users.get_reset_password_router())
# Email verification: /api/auth/request-verify-token (always 202) +
# /api/auth/verify. Always wired; whether anything ENFORCES verification is
# the REQUIRE_EMAIL_VERIFICATION setting (see core/config.py) — off means
# registration stays frictionless and these endpoints just sit dark.
router.include_router(fastapi_users.get_verify_router(UserRead))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(current_active_user)):
    return user


@router.delete("/me", status_code=204)
def delete_me(
    db: Session = Depends(get_db), user: User = Depends(current_active_user)
):
    user_service.delete_account(db, user)


# --- Google sign-in (see app/services/oauth.py)
#
# Both routes are plain browser navigations rather than fetches: the person
# leaves for accounts.google.com and comes back, so every response here is a
# redirect. Relative redirect targets keep them on whichever origin the
# browser is already on (the Next.js app, which proxies /api/*).


def _frontend_origin() -> str:
    """The origin Google must redirect back to. Configured value in
    production, the Next dev server otherwise — the same convention as the
    links in password-reset emails (app/core/auth.py). It cannot be derived
    from the request: Google's redirect back carries no Origin header, and
    the token exchange requires the byte-identical URI used to start the
    flow."""
    return (get_settings().public_base_url or "http://localhost:3000").rstrip("/")


def _back_to_login(message: str) -> RedirectResponse:
    """Bounce to the sign-in page with something the user can read; the page
    shows ?error= above the form."""
    response = RedirectResponse(f"/login?error={quote(message)}", status_code=303)
    response.delete_cookie(oauth_service.CSRF_COOKIE_NAME)
    return response


@router.get("/google/authorize", include_in_schema=False)
async def google_authorize() -> RedirectResponse:
    try:
        url, csrf_token = await oauth_service.authorize_url(_frontend_origin())
    except HTTPException as exc:
        # Google sign-in not configured: the button isn't drawn, but a stale
        # link or bookmark shouldn't dead-end on a JSON error page.
        return _back_to_login(str(exc.detail))
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        oauth_service.CSRF_COOKIE_NAME,
        csrf_token,
        max_age=oauth_service.STATE_LIFETIME_SECONDS,
        httponly=True,
        secure=get_settings().auth_cookie_secure,
        # lax, not strict: the cookie has to survive Google redirecting the
        # browser back to us.
        samesite="lax",
    )
    return response


@router.get("/google/callback", include_in_schema=False)
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Where Google returns the person. Every failure — including simply
    changing their mind at the consent screen — lands back on /login with a
    readable message rather than a JSON error page."""
    if error or not code or not state:
        # error=access_denied is the ordinary "cancelled" path.
        message = (
            "Sign-in was cancelled."
            if error == "access_denied"
            else oauth_service.SIGN_IN_FAILED
        )
        return _back_to_login(message)
    try:
        user = await oauth_service.complete_login(
            db,
            code=code,
            state=state,
            csrf_cookie=request.cookies.get(oauth_service.CSRF_COOKIE_NAME),
            base_url=_frontend_origin(),
        )
    except HTTPException as exc:
        return _back_to_login(
            exc.detail if isinstance(exc.detail, str) else oauth_service.SIGN_IN_FAILED
        )

    response = RedirectResponse("/", status_code=303)
    response.delete_cookie(oauth_service.CSRF_COOKIE_NAME)
    return await attach_session_cookie(user, response)
