"""fastapi-users wiring: JWT in an httponly cookie, plus a bearer variant.

Lives in core/ (not services/) because it's cross-cutting wiring that routes
depend on for their auth dependencies; it composes services/email for the
reset flow — the one sanctioned core→services import.

The cookie transport means the web frontend's SSE fetch to /api/chat needs no
Authorization-header plumbing — the browser attaches the cookie itself.

The bearer transport serves a future mobile app: /api/auth/bearer/login
returns the same JWT in the response body, and the app sends it back as an
Authorization: Bearer header. Both transports share one JWT strategy, so a
token from either login works on every protected route.
"""
import logging
import uuid
from collections.abc import Generator
from typing import Any, Optional

import anyio
from fastapi import Depends, HTTPException, Request
from fastapi_users import BaseUserManager, FastAPIUsers, InvalidPasswordException, UUIDIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    CookieTransport,
    JWTStrategy,
)
from fastapi_users.db import BaseUserDatabase
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models import User
from app.services.email import send_email

logger = logging.getLogger("astoicmind")


class SyncSQLAlchemyUserDatabase(BaseUserDatabase[User, uuid.UUID]):
    """fastapi-users DB adapter over the app's synchronous SQLAlchemy session.

    The stock SQLAlchemyUserDatabase requires an AsyncSession; this app is sync
    throughout (and psycopg's async mode does not run on the Windows Proactor
    event loop uvicorn uses), so we implement the small adapter surface
    directly. Auth queries are tiny, so briefly blocking the loop is fine.
    """

    def __init__(self, session: Session):
        self.session = session

    async def get(self, id: uuid.UUID) -> Optional[User]:
        return self.session.get(User, id)

    async def get_by_email(self, email: str) -> Optional[User]:
        return self.session.scalar(
            select(User).where(func.lower(User.email) == email.lower())
        )

    async def create(self, create_dict: dict[str, Any]) -> User:
        user = User(**create_dict)
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user

    async def update(self, user: User, update_dict: dict[str, Any]) -> User:
        for field, value in update_dict.items():
            setattr(user, field, value)
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user

    async def delete(self, user: User) -> None:
        self.session.delete(user)
        self.session.commit()


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = get_settings().auth_secret
    verification_token_secret = get_settings().auth_secret

    async def validate_password(self, password: str, user) -> None:
        if len(password) < 8:
            raise InvalidPasswordException(
                reason="Password must be at least 8 characters"
            )

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        logger.info("user registered: %s", user.email)
        if get_settings().require_email_verification:
            await self.request_verify(user, request)

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        """Email the verification link. Same origin logic as the reset flow
        below: the link must point at the frontend, which serves /verify."""
        settings = get_settings()
        base = (settings.public_base_url or "http://localhost:3000").rstrip("/")
        link = f"{base}/verify?token={token}"
        text = (
            f"Welcome to {settings.app_name}!\n\n"
            f"Confirm your email address here (the link works for one hour):\n"
            f"{link}\n\n"
            "If you didn't create this account, you can ignore this email."
        )
        await anyio.to_thread.run_sync(
            lambda: send_email(user.email, "Verify your email", text)
        )
        logger.info("verification email queued for %s", user.email)

    async def on_after_verify(self, user: User, request: Optional[Request] = None):
        logger.info("email verified: %s", user.email)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        """Email the reset link. The frontend's /reset-password page reads
        ?token= and posts the new password; the token is fastapi-users' own,
        good for one hour by default.

        The link must point at the FRONTEND origin — this request arrived
        through the Next.js rewrite proxy, so request.base_url would be the
        backend's own address. public_base_url is required in production
        (app/main.py warns if it's missing); dev falls back to the Next dev
        server."""
        settings = get_settings()
        base = (settings.public_base_url or "http://localhost:3000").rstrip("/")
        link = f"{base}/reset-password?token={token}"
        text = (
            "Someone (hopefully you) asked to reset the password for your "
            f"{settings.app_name} account.\n\n"
            f"Set a new password here (the link works for one hour):\n{link}\n\n"
            "If this wasn't you, you can ignore this email — your password "
            "is unchanged."
        )
        # The HTTP send is blocking; keep it off the event loop.
        await anyio.to_thread.run_sync(
            lambda: send_email(user.email, "Reset your password", text)
        )
        logger.info("password reset email queued for %s", user.email)


def get_user_db(
    db: Session = Depends(get_db),
) -> Generator[SyncSQLAlchemyUserDatabase, None, None]:
    yield SyncSQLAlchemyUserDatabase(db)


def get_user_manager(
    user_db: SyncSQLAlchemyUserDatabase = Depends(get_user_db),
) -> Generator[UserManager, None, None]:
    yield UserManager(user_db)


cookie_transport = CookieTransport(
    cookie_name="astoicmind_auth",
    cookie_max_age=get_settings().auth_token_lifetime_seconds,
    cookie_secure=get_settings().auth_cookie_secure,
    cookie_samesite="lax",
)


def get_jwt_strategy() -> JWTStrategy:
    settings = get_settings()
    return JWTStrategy(
        secret=settings.auth_secret,
        lifetime_seconds=settings.auth_token_lifetime_seconds,
    )


auth_backend = AuthenticationBackend(
    name="cookie",
    transport=cookie_transport,
    get_strategy=get_jwt_strategy,
)

bearer_transport = BearerTransport(tokenUrl="api/auth/bearer/login")

bearer_backend = AuthenticationBackend(
    name="bearer",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](
    get_user_manager, [auth_backend, bearer_backend]
)

current_active_user = fastapi_users.current_user(active=True)
# None when the request carries no (valid) auth cookie — anonymous use is allowed.
current_user_optional = fastapi_users.current_user(active=True, optional=True)
current_superuser = fastapi_users.current_user(active=True, superuser=True)

# The gate for metered/paid actions when REQUIRE_EMAIL_VERIFICATION is on.
# With the flag off this is identical to current_active_user, so routes can
# depend on it unconditionally — flipping the flag is the whole rollout.
# Unverified users can still sign in and read (that's current_active_user);
# the frontend shows a verify banner driven by /api/meta + user.is_verified.
current_verified_user = fastapi_users.current_user(
    active=True, verified=get_settings().require_email_verification
)


def require_plus(user: User, message: str) -> None:
    """402 unless the account is Plus (or superuser) — the gate for paid-only
    features. Lives here (not services/billing.py) because it's a route gate
    like the dependencies above, and it must survive if the billing module is
    removed (tier just stays 'free' and the gate denies everyone but
    superusers — honest behavior for an app that never charges)."""
    if user.is_superuser or user.tier == "plus":
        return
    raise HTTPException(
        status_code=402, detail={"code": "plus_required", "message": message}
    )


def ensure_verified(user: Optional[User]) -> None:
    """The same gate for routes whose user is OPTIONAL (e.g. chat, where
    anonymous use is allowed): a signed-in-but-unverified account gets a
    structured 403 the frontend turns into a "check your inbox" nudge.
    Anonymous requests pass — they're governed by the per-IP cap instead."""
    if (
        get_settings().require_email_verification
        and user is not None
        and not user.is_verified
    ):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "verification_required",
                "message": "Verify your email address to continue.",
            },
        )
