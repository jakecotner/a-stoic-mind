"""Sign in with Google.

The flow, in order:

1. The browser hits GET /api/auth/google/authorize. We mint a short-lived
   signed `state` carrying a random CSRF token, drop the same token in a
   cookie, and redirect to Google.
2. Google sends the person back to /api/auth/google/callback with a code.
   We check the state's signature AND that its CSRF token matches the cookie
   (so a link someone else forged can't complete a sign-in), swap the code
   for an access token, and ask Google who it belongs to.
3. fastapi-users' UserManager turns that into a User row — reusing the
   account with the same email address if one exists (see LINK_BY_EMAIL) —
   and the route sets the ordinary session cookie.

With GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET unset the whole feature is dark:
both endpoints 503 and /api/meta tells the frontend not to draw the button.

HTTP-free except HTTPException (the sanctioned exception): the route passes
in primitives (the code, the state, the cookie value, the frontend origin).
"""
import logging
import secrets
from typing import Any

import httpx
import jwt  # pyjwt, via fastapi-users — for the decode errors below
from fastapi import HTTPException
from fastapi_users.exceptions import UserAlreadyExists
from fastapi_users.jwt import decode_jwt, generate_jwt
from httpx_oauth.clients.google import GoogleOAuth2
from httpx_oauth.oauth2 import GetAccessTokenError
from sqlalchemy.orm import Session

from app.core.auth import SyncSQLAlchemyUserDatabase, UserManager
from app.core.config import Settings, get_settings
from app.models import User

logger = logging.getLogger("astoicmind")

# An existing email+password account for the same address is REUSED rather
# than refused: one person, one account, both ways in. Safe because we only
# accept addresses Google reports as verified (_google_identity below).
LINK_BY_EMAIL = True

# openid+email+profile: the standard set. "openid" is what makes Google
# return an id_token and populate the userinfo endpoint we read below.
SCOPES = ["openid", "email", "profile"]

# OpenID Connect userinfo. Preferred over httpx-oauth's get_id_email(), which
# calls the People API — that one needs the API switched on in the Cloud
# project and, more importantly, doesn't say whether the address is verified.
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"

# Signed state token: audience + short lifetime, verified on the way back.
STATE_AUDIENCE = "astoicmind:oauth-state"
STATE_LIFETIME_SECONDS = 10 * 60
CSRF_COOKIE_NAME = "astoicmind_oauth_csrf"

# What the user sees on /login when a sign-in doesn't complete. Deliberately
# vague — the detail goes to the log, not to the browser.
SIGN_IN_FAILED = "Google sign-in didn't complete. Please try again."


def _require_google() -> Settings:
    settings = get_settings()
    if not (settings.google_client_id and settings.google_client_secret):
        raise HTTPException(
            status_code=503,
            detail="Google sign-in isn't configured on this server.",
        )
    return settings


def _client(settings: Settings) -> GoogleOAuth2:
    return GoogleOAuth2(
        settings.google_client_id or "",
        settings.google_client_secret or "",
        scopes=SCOPES,
    )


def redirect_uri(base_url: str) -> str:
    """Where Google sends the person back. Must match the "Authorized redirect
    URI" registered in the Google Cloud console EXACTLY, and must be on the
    frontend origin — the browser reaches the API through the Next.js proxy,
    so that's where the session cookie has to land."""
    return f"{base_url.rstrip('/')}/api/auth/google/callback"


def _state_token(csrf_token: str, secret: str) -> str:
    return generate_jwt(
        {"csrf": csrf_token, "aud": STATE_AUDIENCE},
        secret,
        lifetime_seconds=STATE_LIFETIME_SECONDS,
    )


async def authorize_url(base_url: str) -> tuple[str, str]:
    """Build the Google consent URL. Returns (url, csrf_token); the route puts
    the CSRF token in a cookie so the callback can match it against `state`."""
    settings = _require_google()
    csrf_token = secrets.token_urlsafe(32)
    url = await _client(settings).get_authorization_url(
        redirect_uri(base_url),
        state=_state_token(csrf_token, settings.auth_secret),
        # Always let people choose which Google account to use — a shared
        # computer shouldn't silently sign in whoever logged in last.
        extras_params={"prompt": "select_account"},
    )
    return url, csrf_token


def _check_state(state: str, csrf_cookie: str | None, secret: str) -> None:
    try:
        claims: dict[str, Any] = decode_jwt(state, secret, [STATE_AUDIENCE])
    except jwt.PyJWTError as exc:
        logger.warning("google sign-in: bad state token (%s)", exc)
        raise HTTPException(status_code=400, detail=SIGN_IN_FAILED) from exc
    expected = claims.get("csrf")
    if (
        not csrf_cookie
        or not isinstance(expected, str)
        or not secrets.compare_digest(csrf_cookie, expected)
    ):
        logger.warning("google sign-in: CSRF cookie missing or mismatched")
        raise HTTPException(status_code=400, detail=SIGN_IN_FAILED)


async def _google_identity(access_token: str) -> tuple[str, str]:
    """Ask Google who the token belongs to. Returns (account id, email).

    `sub` is Google's permanent id for the account — the email can change, so
    the link row is keyed on `sub`. An unverified address is refused outright:
    everything downstream (including reusing an existing account with the same
    email) trusts Google's word that the person owns the address.
    """
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            USERINFO_ENDPOINT, headers={"Authorization": f"Bearer {access_token}"}
        )
    if resp.status_code >= 400:
        logger.warning("google sign-in: userinfo failed (%s)", resp.status_code)
        raise HTTPException(status_code=400, detail=SIGN_IN_FAILED)
    profile = resp.json()
    account_id, email = profile.get("sub"), profile.get("email")
    if not account_id or not email:
        logger.warning("google sign-in: userinfo response had no sub/email")
        raise HTTPException(status_code=400, detail=SIGN_IN_FAILED)
    if not profile.get("email_verified"):
        raise HTTPException(
            status_code=400,
            detail=(
                "Google hasn't verified that email address, so it can't be "
                "used to sign in. Try email and password instead."
            ),
        )
    return account_id, email


async def complete_login(
    db: Session,
    *,
    code: str,
    state: str,
    csrf_cookie: str | None,
    base_url: str,
) -> User:
    """Finish the callback: validate state, trade the code for an identity,
    and return the (possibly brand-new) user to sign in."""
    settings = _require_google()
    _check_state(state, csrf_cookie, settings.auth_secret)

    try:
        token = await _client(settings).get_access_token(code, redirect_uri(base_url))
    except GetAccessTokenError as exc:
        logger.warning("google sign-in: code exchange failed (%s)", exc)
        raise HTTPException(status_code=400, detail=SIGN_IN_FAILED) from exc

    account_id, email = await _google_identity(token["access_token"])

    manager = UserManager(SyncSQLAlchemyUserDatabase(db))
    try:
        user = await manager.oauth_callback(
            "google",
            token["access_token"],
            account_id,
            email,
            token.get("expires_at"),
            token.get("refresh_token"),
            associate_by_email=LINK_BY_EMAIL,
            # Google verified the address (checked above), so the account
            # starts verified — it never needs the confirm-your-email round
            # trip.
            is_verified_by_default=True,
        )
    except UserAlreadyExists as exc:
        # Only reachable with LINK_BY_EMAIL off: the address is taken by an
        # account this Google login isn't linked to.
        raise HTTPException(
            status_code=400,
            detail=(
                "There's already an account with that email address. Sign in "
                "with your password instead."
            ),
        ) from exc
    if not user.is_active:
        raise HTTPException(status_code=400, detail=SIGN_IN_FAILED)
    logger.info("google sign-in: %s", user.email)
    return user
