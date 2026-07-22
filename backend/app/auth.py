"""fastapi-users wiring: JWT in an httponly cookie, plus a bearer variant.

The cookie transport means the web frontend's SSE fetch to /api/chat needs no
Authorization-header plumbing — the browser attaches the cookie itself.

The bearer transport serves the Expo mobile app: /api/auth/bearer/login
returns the same JWT in the response body, and the app sends it back as an
Authorization: Bearer header. Both transports share one JWT strategy, so a
token from either login works on every protected route.
"""
import logging
import uuid
from collections.abc import Generator
from typing import Any, Optional

from fastapi import Depends, Request
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

from app.config import get_settings
from app.db import get_db
from app.models import User

logger = logging.getLogger("stoa")


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

    # Hook points for when email sending exists (see also the commented-out
    # verify/reset routers in app/main.py):
    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        logger.info("verification requested for %s (email sending not set up)", user.email)

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        logger.info("password reset requested for %s (email sending not set up)", user.email)


def get_user_db(
    db: Session = Depends(get_db),
) -> Generator[SyncSQLAlchemyUserDatabase, None, None]:
    yield SyncSQLAlchemyUserDatabase(db)


def get_user_manager(
    user_db: SyncSQLAlchemyUserDatabase = Depends(get_user_db),
) -> Generator[UserManager, None, None]:
    yield UserManager(user_db)


cookie_transport = CookieTransport(
    cookie_name="stoa_auth",
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
